"use strict";
// One stateless allowlisted worker for both vertical profiles. Site data only via validated IPC.
const {validateSiteCommand}=require("../core/site-operation-contract.js");
const profile=process.env.PEF_SITE_PROFILE;
const id=process.env.PEF_WORKLOAD_ID;
if(!((profile==="property"&&id==="pef-property")||(profile==="host"&&id==="pef-host")))
  throw Error("SITE_WORKER_PROFILE_NOT_ALLOWLISTED");
const reply=(m,data)=>process.send?.({type:"REPLY",id:m.id,...data});
process.on("message",m=>{
  if(!m||typeof m!=="object")return;
  if(m.type==="HEALTH")reply(m,{ok:true});
  else if(m.type==="METRICS"){
    const cpu=process.cpuUsage(),mem=process.memoryUsage();
    reply(m,{ok:true,observations:{
      rssBytes:mem.rss,cpuUserMicros:cpu.user,cpuSystemMicros:cpu.system,
      uptimeSeconds:process.uptime(),kind:"WORKER_NODE_PROCESS_OBSERVED",
      kernelLimitsEnforced:false}});
  }
  else if(m.type==="SITE_OPERATION")reply(m,validateSiteCommand(profile,m.input));
  else if(m.type==="CRASH"){reply(m,{ok:true});setImmediate(()=>process.exit(42));}
  else reply(m,{ok:false,error:"OPERATION_NOT_ALLOWED"});
});
process.send?.({type:"READY",id,pid:process.pid});
