"use strict";
// One stateless allowlisted worker for both vertical profiles. Site data only via validated IPC.
const fs=require("node:fs"),net=require("node:net");
const {validateSiteCommand}=require("../core/site-operation-contract.js");
const profile=process.env.PEF_SITE_PROFILE;
const id=process.env.PEF_WORKLOAD_ID;
if(!((profile==="property"&&id==="pef-property")||(profile==="host"&&id==="pef-host")))
  throw Error("SITE_WORKER_PROFILE_NOT_ALLOWLISTED");
const reply=(m,data)=>process.send?.({type:"REPLY",id:m.id,...data});
const awaitNetworkDenied=()=>new Promise(resolve=>{
  const socket=net.connect({host:"203.0.113.42",port:8765});
  let done=false;
  const finish=denied=>{if(done)return;done=true;socket.destroy();resolve(denied);};
  socket.setTimeout(350,()=>finish(false));
  socket.once("connect",()=>finish(false));
  socket.once("error",()=>finish(true));
});
process.on("message",m=>{
  if(!m||typeof m!=="object")return;
  if(m.type==="HEALTH")reply(m,{ok:true});
  else if(m.type==="METRICS"){
    const cpu=process.cpuUsage(),mem=process.memoryUsage();
    reply(m,{ok:true,observations:{
      pid:process.pid,rssBytes:mem.rss,heapUsedBytes:mem.heapUsed,
      heapTotalBytes:mem.heapTotal,externalBytes:mem.external,
      arrayBuffersBytes:mem.arrayBuffers,
      cpuUserMicros:cpu.user,cpuSystemMicros:cpu.system,
      uptimeSeconds:process.uptime(),kind:"WORKER_NODE_PROCESS_OBSERVED",
      kernelLimitsEnforced:false}});
  }
  else if(m.type==="SITE_OPERATION")reply(m,validateSiteCommand(profile,m.input));
  else if(m.type==="ISOLATION"&&process.env.PEF_ALLOW_FAULT_INJECTION==="CI_ISOLATED_WORKER"){
    void awaitNetworkDenied().then(networkDenied=>reply(m,{ok:true,uid:process.getuid?.(),
      hostCanaryInaccessible:!fs.existsSync(process.env.PEF_HOST_SENTINEL||"/__host__"),
      networkDenied}));
  }
  else if(m.type==="CRASH"){reply(m,{ok:true});setImmediate(()=>process.exit(42));}
  else reply(m,{ok:false,error:"OPERATION_NOT_ALLOWED"});
});
process.send?.({type:"READY",id,pid:process.pid});
