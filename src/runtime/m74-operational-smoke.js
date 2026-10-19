"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes,randomUUID}=require("node:crypto");
const {runM3RecoverySmoke}=require("../emulator/lab/m3-recovery-smoke.js");
const {createM74OperationsLedger}=require("../adapters/m74-operations-ledger.js");
async function runM74OperationalSmoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m74-ops-"));
 const identity={siteId:"m74-site",deviceId:"m74-edge",configRevision:"r1"};
 const token=randomBytes(32).toString("hex"),checks={};
 let log=null;
 try{
  const recovery=await runM3RecoverySmoke();
  checks.M3_RECOVERY_REUSED=recovery.ok&&recovery.checks?.AUTHENTICATED_LOCAL_RECOVERY===true;
  log=createM74OperationsLedger({dir:root,identity,operatorToken:token});
  const corr=randomUUID(),when=Date.now();
  const record=(type,severity,actor="SYSTEM",opts={})=>
   log.append({type,correlationId:corr,atMillis:when++,severity,actor},opts);
  checks.READY_DURABLE=record("READY","INFO").fsyncCompleted;
  checks.SAFE_MODE_EVIDENCE=record("SAFE_MODE_ENTERED","CRITICAL").fsyncCompleted;
  let unauthorized=false;
  try{record("LOCAL_RECOVERY_REQUESTED","WARNING","OPERATOR",
    {token:randomBytes(32).toString("hex")});}
  catch(e){unauthorized=e.message==="M74_OPERATOR_AUTH_DENIED";}
  checks.UNAUTHORIZED_RECOVERY_DENIED=unauthorized&&log.snapshot().events===2;
  checks.AUTHORIZED_RECOVERY_DURABLE=record("LOCAL_RECOVERY_REQUESTED",
    "WARNING","OPERATOR",{token}).fsyncCompleted;
  checks.RECOVERED_DURABLE=record("RECOVERED","INFO").fsyncCompleted;
  const before=log.snapshot();log.close();log=null;
  log=createM74OperationsLedger({dir:root,identity,operatorToken:token});
  const seen=log.read();
  checks.REOPEN_CHAIN_PRESERVED=seen.length===4&&seen[0].event.correlationId===corr&&
   seen.every((e,i)=>e.sequence===i+1)&&log.snapshot().lastDigest===before.lastDigest;
  checks.SECRETS_REDACTED=!JSON.stringify(seen).includes(token);
  log.close();log=null;
  const file=path.join(root,"pef-m74-operations-v1.ndjson");
  const existing=fs.readFileSync(file,"utf8");
  const altered=existing.replace('"SAFE_MODE_ENTERED"','"CLOUD_RECONCILED"');
  fs.writeFileSync(file,altered,{mode:0o600});
  let tamper=false;
  try{createM74OperationsLedger({dir:root,identity,operatorToken:token});}
  catch(e){tamper=e.message==="M74_CHAIN_INVALID";}
  checks.HASH_CHAIN_TAMPER_BLOCKED=tamper;
  const ok=Object.values(checks).every(Boolean);
  return {kind:"PEF_M74_OPERATIONAL_AUDIT_LAB_V1",ok,
   status:ok?"LAB_PASS":"LAB_FAIL",checks,eventCount:4,
   correlationId:corr,chainProof:before.lastDigest,
   note:"M3 recovery reused; local operator auth used for audit of recovery action; no live OS recovery command",
   physicalPowerCutValidated:false,remoteRecoveryAllowed:false,
   hardwareValidated:false,platform:process.platform,arch:process.arch};
 }finally{if(log)log.close();fs.rmSync(root,{recursive:true,force:true});}
}
module.exports={runM74OperationalSmoke};
