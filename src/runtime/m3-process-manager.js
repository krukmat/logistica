"use strict";
// M3 software-lab headless supervisor. Owns real pef-edge subprocess; no dashboard/cloud.
const fs=require("node:fs"),path=require("node:path");
const {spawn}=require("node:child_process");
const {timingSafeEqual}=require("node:crypto");
const {createM3PolicyStore,normalize}=require("./m3-policy-store.js");
const {validateEdgeConfig}=require("./edge-config.js");
const {evaluateM3Diagnostics}=require("../core/m3-diagnostics.js");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function createManagedEdge({configFile,token,maxRestarts=2,restartDelayMs=180,
 healthIntervalMs=500,healthFailures=3,onEvent=()=>{}}={}){
 if(typeof configFile!=="string"||!path.isAbsolute(configFile)||!fs.statSync(configFile).isFile()||
    fs.lstatSync(configFile).isSymbolicLink())throw Error("M3_CONFIG_FILE_REQUIRED");
 const cfg=validateEdgeConfig(JSON.parse(fs.readFileSync(configFile,"utf8")));
 if(typeof token!=="string"||token.length<24||token.length>256||/\s/.test(token))throw Error("M3_OPERATOR_TOKEN_REQUIRED");
 if(!Number.isInteger(maxRestarts)||maxRestarts<0||maxRestarts>5||
  !Number.isInteger(restartDelayMs)||restartDelayMs<100||restartDelayMs>10000||
  !Number.isInteger(healthIntervalMs)||healthIntervalMs<100||healthIntervalMs>10000||
  !Number.isInteger(healthFailures)||healthFailures<1||healthFailures>5)
  throw Error("M3_INVALID_RECOVERY_POLICY");
 const policyStore=createM3PolicyStore({dir:cfg.storageDir,identity:cfg.identity,initialPolicy:{
  maxRestarts,restartDelayMs,healthIntervalMs,healthFailures}});
 let policy=policyStore.snapshot().policy;
 let child=null,readyUrl=null,phase="NEW",restartCount=0,misses=0,safeModeReason=null;
 let changing=false,operationalEvents=[];
 let stopping=false,started=false,restarting=false,healthTimer=null,exitPromise=null;
 const report=(type,details={})=>{const event={kind:"PEF_M3_LIFECYCLE_V1",
   type,at:new Date().toISOString(),phase,...details,
   scope:"SOFTWARE_LAB_ONLY",physicalValidated:false};
  operationalEvents.push({type:event.type,at:event.at,phase:event.phase,reason:details.reason});
  if(operationalEvents.length>64)operationalEvents.shift();
  onEvent(event);return event;};
 function status(){return {kind:"PEF_M3_MANAGER_STATUS_V1",phase,pid:child?.pid||null,
  url:readyUrl,restartCount,missedReadinessChecks:misses,backend:cfg.backend,
  lockGuarantee:"ADVISORY_PID_ONLY_UNLESS_LINUX_FLOCK_WRAPPER",
  policyRevision:policyStore.snapshot().revision,policy:{...policy},safeModeReason,
  recoveryMode:phase==="SAFE_MODE"?"LOCAL_OPERATOR_REQUIRED":"AUTONOMOUS",
  remoteMutationAllowed:false,
  physicalValidated:false,cloudRequired:false,dashboardRequired:false};}
 function diagnostics(){return evaluateM3Diagnostics(status(),operationalEvents);}
 const cleanupTimer=()=>{if(healthTimer){clearInterval(healthTimer);healthTimer=null;}};
 function resetHealthTimer(){
  cleanupTimer();
  if(phase!=="RUNNING"||stopping)return;
  healthTimer=setInterval(()=>{void poll();},policy.healthIntervalMs);
  healthTimer.unref?.();
 }
 function safeMode(reason){
  cleanupTimer();phase="SAFE_MODE";safeModeReason=reason;
  report("SAFE_MODE_ENTERED",{reason,restartCount});
 }
 async function poll(){
  if(phase!=="RUNNING"||stopping||!child||!readyUrl)return;
  const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),400);
  let ok=false;
  try{
   const response=await fetch(readyUrl+"ready",{
    headers:{"x-pef-token":token},signal:ctrl.signal});
   if(response.status===200){const body=await response.json();ok=body.ok===true;}
  }catch{}finally{clearTimeout(t);}
  if(stopping||phase!=="RUNNING")return;
  misses=ok?0:misses+1;
  if(misses>=policy.healthFailures){
   phase="UNHEALTHY";report("READINESS_FAILURE",{misses});
   cleanupTimer();
   child?.kill("SIGTERM");
   const target=child;
   setTimeout(()=>{if(target&&target.exitCode===null&&target.signalCode===null)
    target.kill("SIGKILL");},900).unref?.();
  }
 }
 async function launch(){
  phase="BOOTING";readyUrl=null;misses=0;
  const entry=path.resolve(__dirname,"../../bin/pef-edge.js");
  const p=spawn(process.execPath,[entry,"--config",configFile],{
   cwd:path.dirname(entry),env:{...process.env,PEF_EDGE_TOKEN:token},
   stdio:["ignore","pipe","pipe"]});
  child=p;
  let out="",err="",ready=false;
  const startedAt=Date.now();
  exitPromise=new Promise(resolve=>p.once("exit",(code,signal)=>resolve({code,signal})));
  const readyWait=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error("M3_CHILD_BOOT_TIMEOUT")),8000);
   p.stdout.on("data",buf=>{
    out=(out+buf.toString()).slice(-8192);
    for(const line of out.split("\n")){
     try{const e=JSON.parse(line);
      if(e.kind==="PEF_EDGE_READY"&&!ready){
       ready=true;clearTimeout(timer);resolve(e);
      }
     }catch{}
    }
   });
   p.stderr.on("data",buf=>{err=(err+buf.toString()).slice(-500);});
   p.once("exit",()=>{if(!ready){clearTimeout(timer);
    reject(Error("M3_CHILD_EXIT_BEFORE_READY:"+err));}});
   p.once("error",e=>{clearTimeout(timer);reject(e);});
  });
  let marker;
  try{marker=await readyWait;}
  catch(e){if(p.exitCode===null&&p.signalCode===null)p.kill("SIGKILL");
   await exitPromise;throw e;}
  if(stopping){p.kill("SIGTERM");await exitPromise;return;}
  readyUrl=marker.url;phase="RUNNING";started=true;
  report("READY",{childPid:p.pid,restartCount,bootMs:Date.now()-startedAt});
  resetHealthTimer();
  // Keep exit handler asynchronous; do not restart after operator shutdown.
  void exitPromise.then(async result=>{
   cleanupTimer();
   if(stopping||restarting)return;
   restarting=true;report("CHILD_EXIT",{...result,childPid:p.pid});
   while(!stopping){
    if(restartCount>=policy.maxRestarts){report("RESTART_BUDGET_EXHAUSTED",
      {restartCount});safeMode("RESTART_BUDGET_EXHAUSTED");break;}
    restartCount++;
    phase="RECOVERING";report("RESTART_SCHEDULED",{restartCount});
    await wait(Math.min(3000,policy.restartDelayMs*2**(restartCount-1)));
    if(stopping)break;
    try{await launch();break;}
    catch(e){report("RESTART_FAILED",{error:String(e.message||e),restartCount});}
   }
   restarting=false;
  });
 }
 async function start(){
  if(phase!=="NEW")throw Error("M3_ALREADY_STARTED");
  try{
   if(policyStore.snapshot().recoveredStage)
    report("INTERRUPTED_CONFIG_ROLLED_BACK",{revision:policyStore.snapshot().revision});
   await launch();return status();}
  catch(e){report("BOOT_FAILED",{error:String(e.message||e)});
   safeMode("BOOT_FAILED");throw e;}
 }
 async function stop(){
  if(stopping)return status();
  stopping=true;cleanupTimer();phase="STOPPING";report("SHUTDOWN_REQUESTED");
  let graceful=true;
  if(child&&child.exitCode===null&&child.signalCode===null){
   child.kill("SIGTERM");
   await Promise.race([exitPromise,wait(2500)]);
   if(child.exitCode===null&&child.signalCode===null){graceful=false;child.kill("SIGKILL");await exitPromise;}
  }
  phase="STOPPED";report("STOPPED",{graceful});
  return status();
 }
 function crashForLab(){
  if(cfg.backend!=="virtual-lab"||phase!=="RUNNING"||!child)
   throw Error("M3_FAULT_INJECTION_LAB_ONLY");
  const pid=child.pid;
  child.kill("SIGKILL");return {injected:true,pid,physicalValidated:false};
 }

 async function readinessProbe(){
  if(!readyUrl||!child||child.exitCode!==null||child.signalCode!==null)return false;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),850);
  try{
   const response=await fetch(readyUrl+"ready",{headers:{"x-pef-token":token},
    signal:controller.signal});
   if(response.status!==200)return false;
   return (await response.json()).ok===true;
  }catch{return false;}finally{clearTimeout(timer);}
 }
 async function applyPolicy(change,{probe=readinessProbe}={}){
  if(phase!=="RUNNING"||stopping||changing)return {ok:false,error:"M3_CONFIG_CHANGE_BLOCKED"};
  if(cfg.backend!=="virtual-lab")return {ok:false,error:"M3_CONFIG_DEVICE_UNAUTHORIZED"};
  if(!change||Object.keys(change).sort().join(",")!=="expectedRevision,policy,revision")
   return {ok:false,error:"M3_CONFIG_REQUEST_INVALID"};
  let candidate;
  try{candidate=normalize(change.policy);}
  catch(e){return {ok:false,error:String(e.message||e)};}
  const current=policyStore.snapshot();
  if(change.expectedRevision!==current.revision||change.revision!==current.revision+1)
   return {ok:false,error:"M3_REVISION_CONFLICT",revision:current.revision};
  changing=true;
  const previous=policy;
  try{
   const staged=policyStore.stage({...change,policy:candidate});
   report("CONFIG_STAGED",{revision:change.revision,previousRevision:change.expectedRevision});
   policy=candidate;resetHealthTimer();
   report("CONFIG_ACTIVATED",{revision:change.revision,scope:"SUPERVISOR_POLICY_ONLY"});
   let ready=false;
   try{ready=await probe();}catch{ready=false;}
   if(ready!==true){
    policy=previous;resetHealthTimer();
    policyStore.rollback();
    report("CONFIG_ROLLED_BACK",{revision:change.revision,reason:"HEALTH_CHECK_FAILED"});
    return {ok:false,status:"ROLLED_BACK",revision:staged.revision,
     error:"M3_CONFIG_HEALTH_CHECK_FAILED",physicalValidated:false};
   }
   const committed=policyStore.commit();
   report("CONFIG_COMMITTED",{revision:committed.revision});
   return {ok:true,status:"COMMITTED",revision:committed.revision,
    policy:{...committed.policy},physicalValidated:false};
  }catch(e){
   // Commit after rename but before parent fsync can have an uncertain outcome.
   // Do NOT claim rollback/commit on an ambiguous durable write.
   safeMode("CONFIG_TRANSACTION_UNCERTAIN");
   report("CONFIG_TRANSACTION_FAILED",{error:String(e.message||e)});
   return {ok:false,status:"SAFE_MODE",error:"M3_CONFIG_TRANSACTION_UNCERTAIN",
    physicalValidated:false};
  }finally{changing=false;}
 }
 async function recoverLocal({operatorToken}={}){
  if(phase!=="SAFE_MODE"||stopping)return {ok:false,error:"M3_NOT_IN_SAFE_MODE"};
  const provided=typeof operatorToken==="string"?Buffer.from(operatorToken):Buffer.alloc(0);
  const expected=Buffer.from(token);
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected))
   return {ok:false,error:"M3_LOCAL_OPERATOR_AUTH_REQUIRED"};
  if(child&&child.exitCode===null&&child.signalCode===null)
   return {ok:false,error:"M3_ACTIVE_PROCESS_REQUIRES_MANUAL_INSPECTION"};
  safeModeReason=null;restartCount=0;phase="RECOVERING";
  report("LOCAL_RECOVERY_REQUESTED",{authorizedLocally:true});
  try{
   await launch();
   return {ok:true,status:"RECOVERED",revision:policyStore.snapshot().revision,
    physicalValidated:false};
  }catch(e){
   safeMode("LOCAL_RECOVERY_FAILED");
   return {ok:false,status:"SAFE_MODE",error:"M3_LOCAL_RECOVERY_FAILED"};
  }
 }
 return {start,stop,status,diagnostics,crashForLab,applyPolicy,recoverLocal};

}
module.exports={createManagedEdge};
