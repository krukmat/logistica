"use strict";
// Standalone host, NOT the dashboard. Exact shared Core and OS-journal backend.
const http=require("node:http");
const {timingSafeEqual,randomBytes}=require("node:crypto");
const {createLabCloudReplica}=require("../emulator/lab/cloud-replay.js");
const {validateEdgeConfig}=require("./edge-config.js");
const {acquireEdgeLock}=require("./single-writer.js");
const {createVirtualWanPorts}=require("../adapters/virtual-wan-ports.js");
const {openRuntimeBackend}=require("./backend-registry.js");
const {createWorkloadManager}=require("../core/workload-manager.js");
const {createWorkloadSupervisor}=require("../core/workload-supervisor.js");
const {createNodeProcessDriver}=require("../adapters/node-process-driver.js");
const {demoManifest,propertyManifest,hostManifest}=require("./demo-workload.js");
const {openLabBoot}=require("./lab-boot-metadata.js");
function createAutonomousEdgeHost({config,token,workloadDriver,cloudTransport}={}){
  // Explicit driver injection is for trusted in-process host composition, not HTTP or JSON config.
  // Linux mode MUST NOT silently fall back to an unisolated Node child.
  if(cloudTransport!==undefined&&
     (typeof cloudTransport?.ingest!=="function"||typeof cloudTransport?.verifyAck!=="function"))
    throw Error("CLOUD_LITE_AUTHENTICATED_TRANSPORT_REQUIRED");
  if(workloadDriver!==undefined&&typeof workloadDriver?.start!=="function")
    throw Error("INVALID_WORKLOAD_DRIVER_PORT");
  const cfg=validateEdgeConfig(config);
  if(cfg.backend==="linux-lab"&&cfg.workload.enabled&&!workloadDriver)
    throw Error("LINUX_WORKLOAD_DRIVER_REQUIRED");
  if(typeof token!=="string"||token.length<24||token.length>256||/\s/.test(token))
    throw Error("EDGE_OPERATOR_TOKEN_REQUIRED");
  const lock=acquireEdgeLock(cfg.storageDir);
  let engine=null,supervisor=null,ports=null,server=null,interval=null,closed=false;
  let lastSample=null,lastFault=null,lastCloudLiteSync=null,samples=0,operating=false,started=false,port=null,labCloud=null;
  const workloadId=cfg.workload.profile==="property"?"pef-property":
    cfg.workload.profile==="host"?"pef-host":"pef-receiver";
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
      propertyIncidents:engine.listPropertyIncidents(),hostIncidents:engine.listHostIncidents(),
      activeOverlay:cfg.workload.profile||"receiver",
      workloads:supervisor?supervisor.list():[],sampleCount:samples,lastFault,
      simulatedRoutes:cfg.backend==="virtual-lab"?ports.snapshot():null,
      remoteCloudConnected:false,transportProvisioned:false,
      physicalWanValidated:false,powerCutValidated:false,hardwareValidated:false,
      dashboardRequired:false,scope:"LAB_ONLY_NOT_DEVICE",
      labCloud:labCloud?{...labCloud.status(),available:runtime.network.selectedWan!==null,provisioned:false}:null,
      cloudLite:{configured:Boolean(cloudTransport),scope:"LOCALHOST_ONLY",
        lastSync:lastCloudLiteSync,productionAuthorized:false,physicalValidated:false}};
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
      const s=state();
      const workloadsReady=!cfg.workload.enabled||s.workloads.some(w=>w.workloadId===workloadId&&w.state==="RUNNING");
      const ready=!s.storage.unsafe&&s.runtimeHealth==="HEALTHY"&&workloadsReady;
      send(res,ready?200:503,{ok:ready,kind:"PEF_EDGE_LAB_READINESS",
        storage:s.storage.unsafe?"UNSAFE":"READY",workloads:s.workloads.map(w=>({id:w.workloadId,state:w.state})),
        hardwareValidated:false});return;
    }
    if(req.method==="GET"&&pathname==="/state"){send(res,200,state());return;}
    // Scoped, read-only software-lab metrics. The parent PID also hosts Cloud Lite in M7.5;
    // worker metrics are obtained from the actual allowlisted Node child via IPC.
    if(req.method==="GET"&&pathname==="/lab/workload/metrics"&&
       cfg.backend==="virtual-lab"){
      const result=supervisor?await supervisor.resourceMetrics(workloadId):
        {ok:false,error:"WORKER_RESOURCE_METRICS_UNAVAILABLE"};
      send(res,result.ok?200:503,{kind:"PEF_M75_WORKER_RESOURCE_OBSERVATION_V1",
        ...result,softwareLabOnly:true,physicalValidated:false});
      return;
    }
    if(req.method==="GET"&&pathname==="/receipts"){send(res,200,{receipts:engine.listReceipts()});return;}
    if(req.method==="GET"&&["/property/incidents","/host/incidents"].includes(pathname)){
      send(res,200,{incidents:pathname==="/property/incidents"?engine.listPropertyIncidents():
        engine.listHostIncidents(),scope:"LAB_ONLY"});return;}
    if(req.method!=="POST"){send(res,404,{ok:false,error:"NOT_FOUND"});return;}
    let body;
    try{body=await readBody(req);}catch(e){send(res,400,{ok:false,error:e.message});return;}
    if(pathname==="/property/incidents"||pathname==="/host/incidents"){
      const requested=pathname==="/property/incidents"?"property":"host";
      if(workloadId!=="pef-"+requested||!supervisor){
        send(res,409,{ok:false,error:requested.toUpperCase()+"_WORKLOAD_NOT_ACTIVE"});return;
      }
      const checked=await supervisor.processOperation(workloadId,requested.toUpperCase(),body);
      if(!checked.ok){send(res,checked.error==="WORKLOAD_NOT_RUNNING"?409:400,
        {ok:false,error:checked.error});return;}
      const result=requested==="property"?engine.recordPropertyIncident(body):engine.recordHostIncident(body);
      send(res,receiptStatus(result),result);return;
    }
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
    // Explicitly virtual-only, loopback-and-token guarded Cloud MOCK.
    // No physical WAN or real cloud transport is provisioned by these endpoints.
    if(pathname==="/lab/cloud/fault"&&cfg.backend==="virtual-lab"){
      if(Object.keys(body).length!==1||!["drop-next-ack","forge-next-ack"].includes(body.fault)){
        send(res,400,{ok:false,error:"INVALID_LAB_CLOUD_FAULT"});return;
      }
      if(body.fault==="drop-next-ack")labCloud.dropNextDurableAck();
      else labCloud.forgeNextAck();
      send(res,200,{ok:true,kind:"PEF_LAB_CLOUD_FAULT",fault:body.fault,cloudMockOnly:true});
      return;
    }
    // Real authenticated localhost Cloud Lite transport, opt-in trusted composition.
    // No implicit fallback to the previous in-memory Cloud mock.
    if(pathname==="/lab/cloud-lite/sync"&&cfg.backend==="virtual-lab"){
      if(!cloudTransport){send(res,409,{ok:false,error:"CLOUD_LITE_NOT_CONFIGURED"});return;}
      if(Object.keys(body).length!==0){send(res,400,{ok:false,error:"INVALID_LAB_SYNC_BODY"});return;}
      if(engine.status().network.selectedWan===null){
        send(res,409,{ok:false,error:"CLOUD_UNAVAILABLE"});return;
      }
      try{
        lastCloudLiteSync=await engine.sync(cloudTransport,16,{timeoutMs:1500,maxAttempts:1});
        send(res,lastCloudLiteSync.status==="SYNC_OK"?200:409,
          {ok:lastCloudLiteSync.status==="SYNC_OK",result:lastCloudLiteSync,
           cloudMockOnly:false,localTransport:true,physicalValidated:false});return;
      }catch{
        send(res,503,{ok:false,error:"CLOUD_LITE_TRANSPORT_ERROR"});return;
      }
    }
    if(pathname==="/lab/sync"&&cfg.backend==="virtual-lab"){
      if(Object.keys(body).length!==0){send(res,400,{ok:false,error:"INVALID_LAB_SYNC_BODY"});return;}
      if(engine.status().network.selectedWan===null){
        send(res,409,{ok:false,error:"CLOUD_UNAVAILABLE",cloudMockOnly:true});return;
      }
      try{
        const result=await engine.sync(labCloud,16,{timeoutMs:250,maxAttempts:1});
        send(res,result.status==="SYNC_OK"?200:409,{ok:result.status==="SYNC_OK",
          result,cloudMockOnly:true,realCloudProvisioned:false});
      }catch(e){send(res,503,{ok:false,error:String(e.message||e),cloudMockOnly:true});}
      return;
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
      labCloud=cfg.backend==="virtual-lab"?createLabCloudReplica({
        siteId:cfg.identity.siteId,deviceId:cfg.identity.deviceId,
        allowedRevisions:[cfg.identity.configRevision],proofKey:randomBytes(32)}):null;
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
        const manifest=workloadId==="pef-property"?propertyManifest():
          workloadId==="pef-host"?hostManifest():demoManifest();
        const launched=await supervisor.start(manifest,{
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
