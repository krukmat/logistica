"use strict";
// Process supervisor with injected driver, bounded restart and monotonic retry policy.
// No executable paths or arbitrary shell commands reach this product-domain module.
function createWorkloadSupervisor({manager,driver,clock=()=>Date.now(),autoReconcileMs=0}={}){
  if(!manager||typeof manager.admit!=="function"||typeof manager.release!=="function"||
     !driver||typeof driver.start!=="function"||typeof clock!=="function")
    throw Error("INVALID_SUPERVISOR_PORT");
  if(!Number.isSafeInteger(autoReconcileMs)||autoReconcileMs<0||
    (autoReconcileMs>0&&(autoReconcileMs<100||autoReconcileMs>30000)))
    throw Error("INVALID_SUPERVISOR_INTERVAL");
  const entries=new Map();
  let closed=false,reconcileBusy=false;
  function ensure(){if(closed)throw Error("SUPERVISOR_CLOSED");}
  const show=x=>({workloadId:x.manifest.workload_id,state:x.state,attempts:x.attempts,
    nextRetryAt:x.nextRetryAt,lastError:x.lastError,manifestVersion:x.manifest.manifest_version,
    isolation:x.isolation||"NONE",actualLimitsEnforced:x.actualLimitsEnforced===true,
    kernelLimits:x.kernelLimits||null});
  function onExit(x,reason){
    if(x.stopping||closed||!entries.has(x.manifest.workload_id)||
       x.state==="BACKOFF"||x.state==="ISOLATED")return;
    x.handle=null;x.actualLimitsEnforced=false;
    x.attempts++;
    x.lastError=typeof reason==="string"?reason:"PROCESS_EXITED";
    const cfg=x.manifest.health.restart_policy,now=clock();
    if(now-x.windowStart>cfg.window_seconds*1000){x.windowStart=now;x.attempts=1;}
    if(x.attempts>cfg.max_attempts){x.state="ISOLATED";x.nextRetryAt=null;return;}
    x.state="BACKOFF";
    x.nextRetryAt=now+Math.min(30000,cfg.backoff_seconds*1000*Math.pow(2,x.attempts-1));
  }
  async function boot(x){
    x.state="STARTING";x.nextRetryAt=null;
    try{
      const handle=await driver.start(x.manifest,{onExit:reason=>onExit(x,reason)});
      if(!handle||typeof handle.stop!=="function"||typeof handle.health!=="function")
        throw Error("INVALID_WORKLOAD_PROCESS_PORT");
      if(x.state==="STARTING"){x.handle=handle;x.state="RUNNING";
        x.isolation=handle.isolation||"PROCESS_ONLY";
        x.actualLimitsEnforced=handle.actualLimitsEnforced===true;
        x.kernelLimits=handle.kernelLimits||null;}
      else await handle.stop();
      return {ok:x.state==="RUNNING",...show(x)};
    }catch(e){
      onExit(x,String(e.message||e));
      return {ok:false,...show(x)};
    }
  }
  async function start(manifest,options={}){
    ensure();if(entries.has(manifest?.workload_id))return {ok:false,error:"ALREADY_ADMITTED"};
    const result=manager.admit(manifest,options);
    if(!result.ok)return result;
    const x={manifest:manager.get(manifest.workload_id),state:"ADMITTED",attempts:0,
      windowStart:clock(),nextRetryAt:null,lastError:null,handle:null,stopping:false};
    entries.set(manifest.workload_id,x);
    return boot(x);
  }
  async function reconcile(){
    ensure();if(reconcileBusy)return {ok:false,error:"RECONCILE_BUSY",status:list()};
    reconcileBusy=true;
    try{
    const now=clock(),results=[];
    for(const x of entries.values()){
      if(x.state==="BACKOFF"&&x.nextRetryAt<=now)results.push(await boot(x));
      else if(x.state==="RUNNING"){
        try{const h=await x.handle.health();
          if(h?.ok!==true)onExit(x,"HEALTH_CHECK_FAILED");
        }catch{onExit(x,"HEALTH_CHECK_FAILED");}
      }
    }
    return {ok:true,changes:results,status:list()};
    }finally{reconcileBusy=false;}
  }
  async function stop(id){
    ensure();const x=entries.get(id);if(!x)return {ok:false,error:"WORKLOAD_NOT_FOUND"};
    x.stopping=true;x.state="STOPPING";
    try{if(x.handle)await x.handle.stop();}
    finally{entries.delete(id);manager.release(id);}
    return {ok:true,workloadId:id,state:"STOPPED"};
  }
  async function processReceipt(id,input){
    ensure();const x=entries.get(id);
    if(!x||x.state!=="RUNNING"||!x.handle||typeof x.handle.processReceipt!=="function")
      return {ok:false,error:"WORKLOAD_NOT_RUNNING"};
    try{return await x.handle.processReceipt(input);}
    catch{return {ok:false,error:"WORKLOAD_IPC_FAILURE"};}
  }
  async function crash(id){
    ensure();const x=entries.get(id);
    if(!x||x.state!=="RUNNING"||!x.handle||typeof x.handle.injectCrash!=="function")
      return {ok:false,error:"WORKLOAD_NOT_RUNNING"};
    return await x.handle.injectCrash();
  }
  async function injectFault(id,type){
    ensure();
    if(!["CPU_BURN","MEMORY_PRESSURE"].includes(type))return {ok:false,error:"FAULT_NOT_ALLOWLISTED"};
    const x=entries.get(id);
    if(!x||x.state!=="RUNNING"||!x.handle||typeof x.handle.fault!=="function")
      return {ok:false,error:"ISOLATED_LINUX_DRIVER_REQUIRED"};
    try{return await x.handle.fault(type);}
    catch{return {ok:false,error:"WORKLOAD_IPC_FAILURE"};}
  }
  function list(){return [...entries.values()].map(show);}
  const interval=autoReconcileMs?setInterval(()=>{
    if(!closed)void reconcile().catch(()=>{});
  },autoReconcileMs):null;
  interval?.unref?.();
  async function close(){
    if(closed)return;
    if(interval)clearInterval(interval);
    const ids=[...entries.keys()];
    for(const id of ids)await stop(id);
    closed=true;
  }
  return {start,reconcile,stop,list,close,processReceipt,crash,injectFault,limits:manager.limits,usage:manager.usage};
}
module.exports={createWorkloadSupervisor};
