"use strict";
// Product-domain admission policy. Actual cgroup/namespace isolation belongs to Linux adapters.
const NAME=/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const keys=(v,allowed)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
const integer=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
const copy=x=>JSON.parse(JSON.stringify(x));
function validateWorkloadManifest(m){
  if(!keys(m,["manifest_version","workload_id","compatibility","connectivity_mode","priority","resources","network_intents","health"])||
      m.manifest_version!==1||typeof m.workload_id!=="string"||m.workload_id.length<3||m.workload_id.length>128||
      !NAME.test(m.workload_id)||m.compatibility!=="pef-core-v0.1"||
      !["LOCAL_ONLY_CAPABLE","INTERNET_OPTIONAL","INTERNET_REQUIRED"].includes(m.connectivity_mode)||
      !["essential","optional"].includes(m.priority)||
      !keys(m.resources,["cpu_request_millicores","cpu_limit_millicores","memory_request_mib","memory_limit_mib","storage_request_mib","storage_limit_mib","storage_class"])||
      !["P2","P3"].includes(m.resources.storage_class)||
      !keys(m.health,["liveness","readiness","restart_policy"])||
      !["ipc-heartbeat","ipc-ready"].includes(m.health.liveness)||
      !["ipc-ready"].includes(m.health.readiness)||
      !keys(m.health.restart_policy,["strategy","max_attempts","window_seconds","backoff_seconds"])||
      m.health.restart_policy.strategy!=="bounded"||
      !integer(m.health.restart_policy.max_attempts)||m.health.restart_policy.max_attempts>20||
      !integer(m.health.restart_policy.window_seconds,1)||
      !integer(m.health.restart_policy.backoff_seconds,1)||
      !Array.isArray(m.network_intents)||m.network_intents.length>32)
    return {ok:false,error:"INVALID_MANIFEST"};
  const r=m.resources;
  for(const name of ["cpu","memory","storage"]){
    const request=r[name+"_request_"+(name==="cpu"?"millicores":"mib")];
    const limit=r[name+"_limit_"+(name==="cpu"?"millicores":"mib")];
    if(!integer(request,1)||!integer(limit,1)||request>limit)
      return {ok:false,error:"RESOURCE_REQUEST_EXCEEDS_LIMIT"};
  }
  for(const intent of m.network_intents){
    if(!keys(intent,["kind","scope","destination_class","justification"])||
       !["local_service_discovery","egress","isolated_network","local_service_publish"].includes(intent.kind)||
       !["site","workload","isolated"].includes(intent.scope)||
       (intent.destination_class!==undefined&&!["explicitly_approved","local_site","none"].includes(intent.destination_class))||
       typeof intent.justification!=="string"||intent.justification.length<4||intent.justification.length>240)
      return {ok:false,error:"INVALID_NETWORK_INTENT"};
  }
  return {ok:true};
}
function createWorkloadManager({cpuMillicores=500,memoryMiB=128,storageMiB=128,maxWorkloads=3,approvedIntents=[]}={}){
  if(!integer(cpuMillicores,1)||!integer(memoryMiB,1)||!integer(storageMiB,1)||
    !integer(maxWorkloads,1)||maxWorkloads>32||!Array.isArray(approvedIntents)||
    approvedIntents.some(x=>typeof x!=="string"))
    throw Error("INVALID_WORKLOAD_BUDGET");
  const running=new Map();
  const budgets={cpuMillicores,memoryMiB,storageMiB,maxWorkloads};
  const usage=()=>{const all=[...running.values()].map(x=>x.resources);
    return {cpuMillicores:all.reduce((n,x)=>n+x.cpu_limit_millicores,0),
      memoryMiB:all.reduce((n,x)=>n+x.memory_limit_mib,0),
      storageMiB:all.reduce((n,x)=>n+x.storage_limit_mib,0),count:all.length};
  };
  function admit(m,{trusted=false,offline=false}={}){
    const valid=validateWorkloadManifest(m);
    if(!valid.ok)return valid;
    if(!trusted)return {ok:false,error:"UNTRUSTED_WORKLOAD"};
    if(offline&&m.connectivity_mode==="INTERNET_REQUIRED")
      return {ok:false,error:"WORKLOAD_REQUIRES_WAN"};
    if(m.network_intents.some(i=>!approvedIntents.includes(i.kind+":"+i.scope+":"+(i.destination_class||"none"))))
      return {ok:false,error:"NETWORK_INTENT_DENIED"};
    if(running.has(m.workload_id))return {ok:false,error:"ALREADY_ADMITTED"};
    const u=usage(),r=m.resources;
    if(u.count>=maxWorkloads)return {ok:false,error:"WORKLOAD_CAPACITY_REACHED"};
    if(u.cpuMillicores+r.cpu_limit_millicores>cpuMillicores)return {ok:false,error:"INSUFFICIENT_CPU"};
    if(u.memoryMiB+r.memory_limit_mib>memoryMiB)return {ok:false,error:"INSUFFICIENT_MEMORY"};
    if(u.storageMiB+r.storage_limit_mib>storageMiB)return {ok:false,error:"INSUFFICIENT_STORAGE"};
    running.set(m.workload_id,copy(m));
    return {ok:true,workloadId:m.workload_id,reserved:copy(r),actualLimitsEnforced:false};
  }
  function release(id){if(!running.has(id))return {ok:false,error:"WORKLOAD_NOT_FOUND"};
    running.delete(id);return {ok:true,workloadId:id};}
  return {admit,release,usage,limits:()=>({...budgets}),get:id=>running.has(id)?copy(running.get(id)):null,
    list:()=>[...running.values()].map(copy),scope:"policy only; enforcement requires adapter"};
}
module.exports={validateWorkloadManifest,createWorkloadManager};
