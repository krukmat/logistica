"use strict";
// M3 software-lab headless supervisor. Owns real pef-edge subprocess; no dashboard/cloud.
const fs=require("node:fs"),path=require("node:path");
const {spawn}=require("node:child_process");
const {validateEdgeConfig}=require("./edge-config.js");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function createManagedEdge({configFile,token,maxRestarts=2,restartDelayMs=180,
 healthIntervalMs=500,healthFailures=3,onEvent=()=>{}}={}){
 if(typeof configFile!=="string"||!path.isAbsolute(configFile)||!fs.statSync(configFile).isFile()||
    fs.lstatSync(configFile).isSymbolicLink())throw Error("M3_CONFIG_FILE_REQUIRED");
 const cfg=validateEdgeConfig(JSON.parse(fs.readFileSync(configFile,"utf8")));
 if(typeof token!=="string"||token.length<24||/\s/.test(token))throw Error("M3_OPERATOR_TOKEN_REQUIRED");
 if(!Number.isInteger(maxRestarts)||maxRestarts<0||maxRestarts>5||
  !Number.isInteger(restartDelayMs)||restartDelayMs<100||restartDelayMs>10000||
  !Number.isInteger(healthIntervalMs)||healthIntervalMs<100||healthIntervalMs>10000||
  !Number.isInteger(healthFailures)||healthFailures<1||healthFailures>5)
  throw Error("M3_INVALID_RECOVERY_POLICY");
 let child=null,readyUrl=null,phase="NEW",restartCount=0,misses=0;
 let stopping=false,started=false,restarting=false,healthTimer=null,exitPromise=null;
 const report=(type,details={})=>{const event={kind:"PEF_M3_LIFECYCLE_V1",
   type,at:new Date().toISOString(),phase,...details,
   scope:"SOFTWARE_LAB_ONLY",physicalValidated:false};
  onEvent(event);return event;};
 function status(){return {kind:"PEF_M3_MANAGER_STATUS_V1",phase,pid:child?.pid||null,
  url:readyUrl,restartCount,missedReadinessChecks:misses,backend:cfg.backend,
  lockGuarantee:"ADVISORY_PID_ONLY_UNLESS_LINUX_FLOCK_WRAPPER",
  physicalValidated:false,cloudRequired:false,dashboardRequired:false};}
 const cleanupTimer=()=>{if(healthTimer){clearInterval(healthTimer);healthTimer=null;}};
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
  if(misses>=healthFailures){
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
  healthTimer=setInterval(()=>{void poll();},healthIntervalMs);
  healthTimer.unref?.();
  // Keep exit handler asynchronous; do not restart after operator shutdown.
  void exitPromise.then(async result=>{
   cleanupTimer();
   if(stopping||restarting)return;
   restarting=true;report("CHILD_EXIT",{...result,childPid:p.pid});
   while(!stopping){
    if(restartCount>=maxRestarts){phase="HALTED";report("RESTART_BUDGET_EXHAUSTED",
      {restartCount});break;}
    restartCount++;
    phase="RECOVERING";report("RESTART_SCHEDULED",{restartCount});
    await wait(Math.min(3000,restartDelayMs*2**(restartCount-1)));
    if(stopping)break;
    try{await launch();break;}
    catch(e){report("RESTART_FAILED",{error:String(e.message||e),restartCount});}
   }
   restarting=false;
  });
 }
 async function start(){
  if(phase!=="NEW")throw Error("M3_ALREADY_STARTED");
  try{await launch();return status();}
  catch(e){stopping=true;phase="HALTED";report("BOOT_FAILED",{error:String(e.message||e)});
   throw e;}
 }
 async function stop(){
  if(stopping)return status();
  stopping=true;cleanupTimer();phase="STOPPING";report("SHUTDOWN_REQUESTED");
  if(child&&child.exitCode===null&&child.signalCode===null){
   child.kill("SIGTERM");
   await Promise.race([exitPromise,wait(2500)]);
   if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");await exitPromise;}
  }
  phase="STOPPED";report("STOPPED",{graceful:true});
  return status();
 }
 function crashForLab(){
  if(cfg.backend!=="virtual-lab"||phase!=="RUNNING"||!child)
   throw Error("M3_FAULT_INJECTION_LAB_ONLY");
  const pid=child.pid;
  child.kill("SIGKILL");return {injected:true,pid,physicalValidated:false};
 }
 return {start,stop,status,crashForLab};
}
module.exports={createManagedEdge};
