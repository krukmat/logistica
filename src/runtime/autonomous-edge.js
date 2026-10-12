"use strict";
// Standalone host, NOT the dashboard. Exact shared Core and OS-journal backend.
const http=require("node:http");
const {timingSafeEqual}=require("node:crypto");
const {validateEdgeConfig}=require("./edge-config.js");
const {acquireEdgeLock}=require("./single-writer.js");
const {createVirtualWanPorts}=require("../adapters/virtual-wan-ports.js");
const {openRuntimeBackend}=require("./backend-registry.js");
const {createWorkloadManager}=require("../core/workload-manager.js");
const {createWorkloadSupervisor}=require("../core/workload-supervisor.js");
const {createNodeProcessDriver}=require("../adapters/node-process-driver.js");
const {demoManifest}=require("./demo-workload.js");
const {openLabBoot}=require("./lab-boot-metadata.js");
function createAutonomousEdgeHost({config,token,workloadDriver}={}){
  // Explicit driver injection is for trusted in-process host composition, not HTTP or JSON config.
  // Linux mode MUST NOT silently fall back to an unisolated Node child.
  if(workloadDriver!==undefined&&typeof workloadDriver?.start!=="function")
    throw Error("INVALID_WORKLOAD_DRIVER_PORT");
  const cfg=validateEdgeConfig(config);
  if(cfg.backend==="linux-lab"&&cfg.workload.enabled&&!workloadDriver)
    throw Error("LINUX_WORKLOAD_DRIVER_REQUIRED");
  if(typeof token!=="string"||token.length<24||token.length>256||/\s/.test(token))
    throw Error("EDGE_OPERATOR_TOKEN_REQUIRED");
  const lock=acquireEdgeLock(cfg.storageDir);
  let engine=null,supervisor=null,ports=null,server=null,interval=null,closed=false;
  let lastSample=null,lastFault=null,samples=0,operating=false,started=false,port=null;
  const secret=Buffer.from(token,"utf8");
  const isAuthorized=req=>{
    const received=req.headers["x-pef-token"];
    const input=typeof received==="string"?Buffer.from(received,"utf8"):Buffer.alloc(0);
    return input.length===secret.length&&timingSafeEqual(input,secret);
  };
  function state(){
    if(!started||closed)throw Error("EDGE_HOST_NOT_READY");
    const runtime=engine.status();
    return {kind:"PEF_STANDALONE_EDGE_LAB",backend:cfg.backend,
      identity:runtime.identity,network:runtime.network,storage:runtime.storage,
      runtimeHealth:runtime.runtimeHealth,receipts:engine.listReceipts(),
      workloads:supervisor?supervisor.list():[],sampleCount:samples,lastFault,
      simulatedRoutes:cfg.backend==="virtual-lab"?ports.snapshot():null,
      remoteCloudConnected:false,transportProvisioned:false,
      physicalWanValidated:false,powerCutValidated:false,hardwareValidated:false,
      dashboardRequired:false,scope:"LAB_ONLY_NOT_DEVICE"};
  }
  async function sample(){
    if(operating||closed)return {ok:false,error:"EDGE_SAMPLE_BUSY"};
    operating=true;
    try{
      lastSample=await engine.sample(1);samples++;
      return {ok:true,observed:lastSample.observed,event:lastSample.event};
    }catch(e){lastFault=String(e.message||e);return {ok:false,error:lastFault};}
    finally{operating=false;}
  }
  const send=(res,status,obj)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY"});
    res.end(JSON.stringify(obj));};
  async function readBody(req){
    if(req.headers["content-type"]?.split(";")[0]!=="application/json")
      throw Error("INVALID_CONTENT_TYPE");
    const parts=[];let n=0;
    for await(const chunk of req){n+=chunk.length;if(n>4096)throw Error("BODY_TOO_LARGE");parts.push(chunk);}
    let data;try{data=JSON.parse(Buffer.concat(parts).toString("utf8"));}catch{throw Error("INVALID_JSON");}
    if(!data||typeof data!=="object"||Array.isArray(data))throw Error("INVALID_BODY");
    return data;
  }
  const receiptStatus=result=>result.ok?(result.duplicate?200:201):
    result.error==="EVENT_ID_CONFLICT"?409:
    result.error==="STORAGE_FULL_OR_UNSAFE"?507:
    result.error==="EDGE_RUNTIME_BUSY"?503:400;
  async function handle(req,res){
    if(closed){send(res,503,{ok:false,error:"STOPPING"});return;}
    if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){
      send(res,403,{ok:false,error:"HOST_DENIED"});return;
    }
    const pathname=new URL(req.url,"http://127.0.0.1").pathname;
    if(req.method==="GET"&&pathname==="/health"){
      send(res,200,{ok:true,kind:"PEF_EDGE_LAB_HEALTH",dashboardRequired:false});return;
    }
    if(!isAuthorized(req)){send(res,403,{ok:false,error:"OPERATOR_TOKEN_REQUIRED"});return;}
    if(req.method==="GET"&&pathname==="/ready"){
      const s=state();send(res,s.storage.unsafe?503:200,{ok:!s.storage.unsafe,kind:"PEF_EDGE_LAB_READINESS",
        storage:s.storage.unsafe?"UNSAFE":"READY",workloads:s.workloads.map(w=>({id:w.workloadId,state:w.state})),
        hardwareValidated:false});return;
    }
    if(req.method==="GET"&&pathname==="/state"){send(res,200,state());return;}
    if(req.method==="GET"&&pathname==="/receipts"){send(res,200,{receipts:engine.listReceipts()});return;}
    if(req.method!=="POST"){send(res,404,{ok:false,error:"NOT_FOUND"});return;}
    let body;
    try{body=await readBody(req);}catch(e){send(res,400,{ok:false,error:e.message});return;}
    if(pathname==="/receipts"||pathname==="/workloads/receipts"){
      if(!["receiptId","packageId"].every(k=>typeof body[k]==="string")||
         Object.keys(body).some(k=>!["receiptId","packageId"].includes(k))){
        send(res,400,{ok:false,error:"INVALID_RECEIPT_BODY"});return;
      }
      if(pathname==="/workloads/receipts"){
        if(!supervisor){send(res,409,{ok:false,error:"WORKLOAD_DISABLED"});return;}
        const accepted=await supervisor.processReceipt("pef-receiver",body);
        if(!accepted.ok){send(res,409,{ok:false,error:accepted.error});return;}
      }
      let result;
      try{result=engine.receivePackage(body);}
      catch(e){result={ok:false,error:e.message};}
      send(res,receiptStatus(result),result);return;
    }
    if(pathname==="/lab/wan"&&cfg.backend==="virtual-lab"){
      try{
        if(Object.keys(body).some(k=>!["id","link","upstream"].includes(k)))
          throw Error("INVALID_LAB_WAN");
        const result=ports.set(body.id,body);
        send(res,200,{ok:true,simulation:result});return;
      }catch(e){send(res,400,{ok:false,error:e.message});return;}
    }
    if(pathname==="/lab/sample"&&cfg.backend==="virtual-lab"){
      const outcome=await sample();
      send(res,outcome.ok?200:503,outcome);return;
    }
    send(res,404,{ok:false,error:"NOT_FOUND"});
  }
  async function close(){
    if(closed)return;closed=true;
    if(interval){clearInterval(interval);interval=null;}
    try{
      if(server?.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
      if(supervisor)await supervisor.close();
    }finally{try{engine?.close();}finally{lock.release();}}
  }
  async function listen(){
    if(started)throw Error("ALREADY_LISTENING");
    try{
      ports=cfg.backend==="virtual-lab"?createVirtualWanPorts(cfg.wan):null;
      const boot=openLabBoot({dir:cfg.storageDir,identity:cfg.identity});
      const opening=openRuntimeBackend(cfg.backend,{dir:cfg.storageDir,identity:boot.identity,
        sessionId:boot.sessionId,journalOptions:cfg.journal,
        ...(ports?{ports}:{ns:cfg.linuxLab.ns,repoRoot:cfg.linuxLab.repoRoot})});
      if(!opening.ok)throw Error(opening.error);
      engine=opening.engine;
      const initial=await sample();
      if(!initial.ok)throw Error(initial.error);
      if(cfg.workload.enabled){
        supervisor=createWorkloadSupervisor({
          manager:createWorkloadManager(),driver:workloadDriver||createNodeProcessDriver(),
          autoReconcileMs:cfg.workload.reconcileMs
        });
        const launched=await supervisor.start(demoManifest(),{
          trusted:true,offline:engine.status().network.connectivity==="LOCAL_ONLY"});
        if(!launched.ok)throw Error("WORKLOAD_BOOT_FAILED:"+launched.lastError);
      }
      server=http.createServer((req,res)=>{handle(req,res).catch(()=>{
        if(!res.headersSent)send(res,500,{ok:false,error:"EDGE_HOST_FAILURE"});
        else res.destroy();
      });});
      await new Promise((resolve,reject)=>{
        server.once("error",reject);
        server.listen(cfg.http.port,cfg.http.host,()=>{server.off("error",reject);resolve();});
      });
      port=server.address().port;started=true;
      interval=setInterval(()=>{void sample();},cfg.sampleIntervalMs);
      interval.unref?.();
      return `http://127.0.0.1:${port}/`;
    }catch(e){await close();throw e;}
  }
  return {listen,close,state,port:()=>port,config:cfg};
}
module.exports={createAutonomousEdgeHost};
