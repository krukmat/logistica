"use strict";
// One real managed Edge, virtual WAN, real fsync receipt. Transactional policy + safe-mode proof.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {randomBytes}=require("node:crypto");
const {createManagedEdge}=require("../../runtime/m3-process-manager.js");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function runM3RecoverySmoke(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m3-recovery-"));
 const file=path.join(dir,"config.json"),token=randomBytes(32).toString("hex"),events=[];
 const cfg={schemaVersion:1,backend:"virtual-lab",
  identity:{siteId:"m3-recovery-site",deviceId:"m3-recovery-edge",configRevision:"r1"},
  storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:5000,
  workload:{enabled:true,reconcileMs:250},
  journal:{capacityBytes:65536,controlReserveBytes:4096},
  wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
 fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});
 const manager=createManagedEdge({configFile:file,token,maxRestarts:1,
  restartDelayMs:150,healthIntervalMs:500,healthFailures:3,onEvent:e=>events.push(e.type)});
 const checks={},diagnosticSnapshots=[];
 const capture=(stage,phase)=>{
  const d=manager.diagnostics();
  if(d.phase!==phase||d.kind!=="PEF_M3_OPERATIONAL_DIAGNOSTICS_V1"||
    d.physicalValidated!==false||d.remoteRecoveryAllowed!==false||
    JSON.stringify(d).includes(token))throw Error("M3_DIAGNOSTICS_INVALID:"+stage);
  diagnosticSnapshots.push({stage,...d});
 };
 const check=(id,v)=>{checks[id]=Boolean(v);if(!v)throw Error("M3_RECOVERY_GATE_FAILED:"+id);};
 const get=async(route,body)=>{
  const s=manager.status(),response=await fetch(s.url+route,{
   method:body?"POST":"GET",
   headers:{"x-pef-token":token,...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:response.status,...await response.json()};
 };
 async function until(fn){
  for(let i=0;i<125;i++){const x=await fn();if(x)return x;await wait(40);}
  throw Error("M3_RECOVERY_TIMED_OUT");
 }
 try{
  await manager.start();
  capture("INITIAL","RUNNING");
  const r=await get("workloads/receipts",{receiptId:"M3-REC-1",packageId:"BOX-REC-1"});
  check("RECEIPT_DURABLE",r.http===201&&r.fsyncCompleted===true);
  const before=manager.status(),oldPid=before.pid;
  const p={...before.policy,restartDelayMs:230};
  const commit=await manager.applyPolicy({expectedRevision:1,revision:2,policy:p});
  check("CONFIG_COMMITTED",commit.ok===true&&commit.revision===2&&manager.status().policyRevision===2);
  capture("CONFIG_COMMITTED","RUNNING");
  const stale=await manager.applyPolicy({expectedRevision:1,revision:3,policy:p});
  check("STALE_REVISION_REJECTED",stale.error==="M3_REVISION_CONFLICT"&&manager.status().phase==="RUNNING");
  const reject=await manager.applyPolicy({expectedRevision:2,revision:3,
   policy:{...p,healthIntervalMs:750}},{probe:async()=>false});
  check("HEALTH_ROLLBACK",reject.status==="ROLLED_BACK"&&
   manager.status().policyRevision===2&&manager.status().policy.healthIntervalMs===p.healthIntervalMs);
  manager.crashForLab();
  await until(()=>manager.status().phase==="RUNNING"&&manager.status().pid!==oldPid);
  const reopened=await get("state");
  check("RECOVERED_RECEIPT",reopened.receipts?.length===1&&reopened.receipts[0].receiptId==="M3-REC-1");
  manager.crashForLab();
  await until(()=>manager.status().phase==="SAFE_MODE");
  check("SAFE_MODE_ON_RESTART_EXHAUSTION",manager.status().safeModeReason==="RESTART_BUDGET_EXHAUSTED");
  capture("SAFE_MODE","SAFE_MODE");
  const denied=await manager.recoverLocal({operatorToken:"wrong"});
  check("UNAUTHORIZED_LOCAL_RECOVERY_BLOCKED",denied.error==="M3_LOCAL_OPERATOR_AUTH_REQUIRED");
  const recovery=await manager.recoverLocal({operatorToken:token});
  check("AUTHENTICATED_LOCAL_RECOVERY",recovery.ok===true&&manager.status().phase==="RUNNING");
  capture("LOCAL_RECOVERED","RUNNING");
  const recovered=await get("state");
  check("RECEIPT_SURVIVED_SAFE_MODE",recovered.receipts?.length===1);
  check("REVISION_SURVIVED_CRASH",manager.status().policyRevision===2);
  return {kind:"PEF_M3_RECOVERY_SMOKE_V1",ok:true,status:"LAB_PASS",
   checks,revision:manager.status().policyRevision,safeModeObserved:true,
   recoveredLocally:true,events,diagnosticSnapshots,physicalValidated:false,cloudReal:false,
   kernelFlockOnMac:false,configScope:"SUPERVISOR_POLICY_ONLY"};
 }finally{await manager.stop();fs.rmSync(dir,{recursive:true,force:true});}
}
module.exports={runM3RecoverySmoke};
