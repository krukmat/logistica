"use strict";
// Local-only application-layer connectivity test; never configures routes or host interfaces.
const http=require("node:http");
const {createSimulator}=require("../core.js");
const HOST="127.0.0.1";
const MODES=new Set(["healthy","http_503","blackhole","reset"]);
function makeEndpoint(name){
  let mode="healthy";
  const server=http.createServer((req,res)=>{
    if(req.url!=="/health"){res.writeHead(404).end();return;}
    if(mode==="blackhole")return; // deliberately no response: exercise timeout, not real WAN outage
    if(mode==="reset"){req.socket.destroy();return;}
    if(mode==="http_503"){res.writeHead(503).end("temporarily unavailable");return;}
    res.writeHead(204).end();
  });
  return {
    name,
    setMode(next){if(!MODES.has(next))throw Error("INVALID_FAULT_MODE");mode=next;},
    getMode(){return mode;},
    getServer(){return server;},
    async start(){
      if(server.listening)throw Error("ALREADY_STARTED");
      await new Promise((resolve,reject)=>{
        server.once("error",reject);
        server.listen(0,HOST,()=>{server.off("error",reject);resolve();});
      });
      const address=server.address();
      if(!address||address.address!==HOST)throw Error("UNSAFE_LISTENER_ADDRESS");
      return `http://${HOST}:${address.port}/health`;
    },
    async stop(){
      if(!server.listening)return;
      // Drop blackhole sockets so close() cannot hang; bound to loopback only.
      server.closeAllConnections?.();
      await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    }
  };
}
function probe(url,timeoutMs=100){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw Error("INVALID_PROBE_TIMEOUT");
  if(!/^http:\/\/127\.0\.0\.1:[0-9]+\/health$/.test(url))throw Error("UNSAFE_PROBE_URL");
  return new Promise(resolve=>{
    let finished=false;
    const finish=result=>{if(finished)return;finished=true;resolve(result);};
    const req=http.get(url,res=>{
      const healthy=res.statusCode===204;
      const code=healthy?"HEALTHY":`HTTP_${res.statusCode}`;
      res.resume();
      res.once("end",()=>finish({healthy,code}));
    });
    req.setTimeout(timeoutMs,()=>{req.destroy();finish({healthy:false,code:"TIMEOUT"});});
    req.once("error",err=>finish({healthy:false,code:err.code||"TCP_ERROR"}));
  });
}
async function createLoopbackLab(options={}){
  const endpoints={primary:makeEndpoint("primary"),backup:makeEndpoint("backup")};
  const urls={};let started=[];
  try{
    for(const name of ["primary","backup"]){urls[name]=await endpoints[name].start();started.push(name);}
  }catch(err){await Promise.allSettled(started.map(n=>endpoints[n].stop()));throw err;}
  const simulator=createSimulator({failbackHoldSeconds:2,...options.simulator});
  const observations=[];
  let closed=false;
  return {
    addressFamily:"IPv4-loopback",urls:{...urls},
    setFault(wan,mode){if(closed)throw Error("LAB_CLOSED");if(!endpoints[wan])throw Error("UNKNOWN_WAN");endpoints[wan].setMode(mode);},
    state(){return simulator.status();},
    async sample(seconds=1){
      if(closed)throw Error("LAB_CLOSED");
      const samples=await Promise.all(["primary","backup"].map(async name=>{
        const result=await probe(urls[name],options.timeoutMs||100);
        simulator.act("set_wan",{id:name,link:true,upstream:result.healthy});
        return {wan:name,mode:endpoints[name].getMode(),...result};
      }));
      const result=simulator.act("tick",{seconds});
      observations.push({clock:result.clock,samples,selectedWan:result.selectedWan,connectivity:result.connectivity});
      return {status:result,samples};
    },
    observations(){return JSON.parse(JSON.stringify(observations));},
    trace(){return simulator.trace();},
    act:(...args)=>simulator.act(...args),
    async close(){if(closed)return;closed=true;const completed=await Promise.allSettled(Object.values(endpoints).map(e=>e.stop()));const bad=completed.find(x=>x.status==="rejected");if(bad)throw bad.reason;}
  };
}
async function runLoopbackSuite(){
  const lab=await createLoopbackLab();
  const steps=[],failures=[];
  function check(label,condition,observed){
    const ok=Boolean(condition);steps.push({label,ok,observed});
    if(!ok)failures.push({label,observed});
  }
  try{
    let r=await lab.sample(1);
    check("primary healthy",r.status.selectedWan==="primary",r.status);
    lab.setFault("primary","http_503");r=await lab.sample(1);
    check("failover to backup on HTTP error",r.status.selectedWan==="backup"&&r.samples[0].code==="HTTP_503",r);
    lab.setFault("backup","blackhole");r=await lab.sample(1);
    check("both upstreams unreachable while local remains ready",r.status.connectivity==="LOCAL_ONLY"&&r.status.health==="HEALTHY"&&r.samples[1].code==="TIMEOUT",r);
    const persisted=lab.act("append",{eventId:"loopback-offline-1",payload:{cause:"upstream failure"}});
    check("offline local journal accepted",persisted.ack===true,persisted);
    lab.setFault("primary","healthy");r=await lab.sample(1);
    check("new upstream restored",r.status.selectedWan==="primary",r.status);
    check("backlog replay after real TCP reachability recovered",lab.act("sync").uploaded===1,lab.state());
    lab.setFault("backup","healthy");r=await lab.sample(1);
    check("redundancy restored",r.status.connectivity==="MULTI_WAN_HEALTHY",r.status);
  }catch(error){failures.push({label:"lab execution error",error:String(error.message||error)});}
  finally{try{await lab.close();}catch(error){failures.push({label:"cleanup",error:String(error.message||error)});}}
  return {kind:"PEF_LOOPBACK_LAB",status:failures.length?"LAB_FAIL":"LAB_PASS",scope:"localhost real TCP/HTTP, logical routing model",
    physicalWanValidated:false,hardwareValidated:false,p1DurabilityValidated:false,
    steps,failures,probes:lab.observations(),
    limitations:["HTTP probes bound to 127.0.0.1 only","No L2 carrier, NAT/route, NIC failover or throughput validation","Journal/Cloud replay are logical model only","A probe timeout is not a measured ISP failover p95"]};
}
module.exports={createLoopbackLab,probe,runLoopbackSuite};
