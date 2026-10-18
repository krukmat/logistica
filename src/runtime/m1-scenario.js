"use strict";
// M1 REAL Edge process + real fsync journal, VIRTUAL WAN and EPHEMERAL Cloud mock.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {randomBytes,randomUUID}=require("node:crypto");
const {spawn,execFileSync}=require("node:child_process");
const {once}=require("node:events");
const assert=require("node:assert/strict");
const {performance}=require("node:perf_hooks");
const root=path.resolve(__dirname,"../..");
const cli=path.join(root,"bin/pef-edge.js");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function gitCommit(){
 try{return execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",timeout:2000}).trim();}
 catch{return "UNAVAILABLE";}
}
async function startDaemon(file,token){
 const child=spawn(process.execPath,[cli,"--config",file],{
  cwd:root,env:{...process.env,PEF_EDGE_TOKEN:token},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",ready=null;
 child.stdout.on("data",chunk=>{
  stdout=(stdout+chunk.toString()).slice(-8192);
  for(const line of stdout.split("\n")){
   try{const o=JSON.parse(line);if(o.kind==="PEF_EDGE_READY")ready=o;}catch{}
  }
 });
 child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-8192);});
 const begin=Date.now();
 while(!ready&&child.exitCode===null&&!child.killed&&Date.now()-begin<9000)await sleep(25);
 if(!ready){child.kill("SIGKILL");await once(child,"exit").catch(()=>{});
  throw Error("M1_DAEMON_START_FAILED:"+stderr.slice(-500));}
 return {child,url:ready.url,sessionId:ready.sessionId};
}
async function stopDaemon(h,signal="SIGTERM"){
 if(!h||h.child.exitCode!==null||h.child.signalCode!==null)return;
 h.child.kill(signal);
 await Promise.race([once(h.child,"exit"),sleep(3000)]);
 if(h.child.exitCode===null&&h.child.signalCode===null){
  h.child.kill("SIGKILL");await once(h.child,"exit").catch(()=>{});
 }
}
async function request(h,token,route,body,authorized=true){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),1500);
 try{
  const r=await fetch(h.url+route,{
   method:body===undefined?"GET":"POST",signal:ctl.signal,
   headers:{...(authorized?{"x-pef-token":token}:{}),
    ...(body!==undefined?{"content-type":"application/json"}:{})},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {http:r.status,...await r.json()};
 }finally{clearTimeout(timer);}
}
async function runM1Scenario({runId=randomUUID()}={}){
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m1-"));
 const token=randomBytes(32).toString("hex"),trace=[],createdAt=new Date().toISOString();
 const config={schemaVersion:1,backend:"virtual-lab",
  identity:{siteId:"m1-site",deviceId:"m1-edge",configRevision:"m1-v1"},
  storageDir:workspace,http:{host:"127.0.0.1",port:0},
  sampleIntervalMs:5000,workload:{enabled:true,reconcileMs:250},
  journal:{capacityBytes:1048576,controlReserveBytes:16384},
  wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
 const file=path.join(workspace,"config.json");
 fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
 let one=null,two=null,error=null,finalState=null,initialSession=null;
 const must=(condition,reason)=>assert.ok(condition,reason);
 async function step(id,fn){
  const start=performance.now();
  try{const data=await fn();trace.push({runId,sequence:trace.length+1,id,pass:true,
   durationMs:Math.round((performance.now()-start)*100)/100,data});}
  catch(e){trace.push({runId,sequence:trace.length+1,id,pass:false,
   durationMs:Math.round((performance.now()-start)*100)/100,error:String(e.message||e)});throw e;}
 }
 try{
  await step("M1_01_AUTONOMOUS_EDGE_RUNNING",async()=>{
   one=await startDaemon(file,token);
   const health=await request(one,token,"health"),s=await request(one,token,"state");
   const forbidden=await request(one,token,"state",undefined,false);
   must(health.http===200&&s.http===200&&forbidden.http===403,"M1_DAEMON_AUTH_FAILURE");
   must(s.workloads?.some(w=>w.state==="RUNNING"),"M1_WORKER_NOT_RUNNING");
   initialSession=s.identity.sessionId;
   return {healthHttp:health.http,unauthorizedHttp:forbidden.http,workload:"RUNNING"};
  });
  await step("M1_02_VIRTUAL_WAN_LOCAL_ONLY",async()=>{
   const s=await request(one,token,"state"),sync=await request(one,token,"lab/sync",{});
   must(s.network.connectivity==="LOCAL_ONLY"&&s.network.selectedWan===null,"M1_WAN_NOT_OFFLINE");
   must(sync.http===409&&sync.error==="CLOUD_UNAVAILABLE","M1_CLOUD_ALLOWED_OFFLINE");
   return {connectivity:s.network.connectivity,selectedWan:null,syncDenied:true};
  });
  await step("M1_03_OFFLINE_RECEIPT_FSYNC",async()=>{
   const r=await request(one,token,"workloads/receipts",{receiptId:"M1-001",packageId:"BOX-001"});
   const s=await request(one,token,"state");
   must(r.http===201&&r.fsyncCompleted===true,"M1_RECEIPT_NOT_FSYNCED");
   must(s.receipts.length===1&&s.receipts[0].receiptId==="M1-001"&&!s.receipts[0].cloudAcked,
    "M1_OFFLINE_RECEIPT_NOT_RETAINED");
   return {http:r.http,fsyncCompleted:r.fsyncCompleted,eventId:r.eventId,
    pending:s.storage.pending,journalBytes:s.storage.bytesUsed};
  });
  await step("M1_04_IDEMPOTENCY_AND_CONFLICT",async()=>{
   const duplicate=await request(one,token,"receipts",{receiptId:"M1-001",packageId:"BOX-001"});
   const conflict=await request(one,token,"receipts",{receiptId:"M1-001",packageId:"BOX-TAMPER"});
   const s=await request(one,token,"state");
   must(duplicate.http===200&&duplicate.duplicate===true&&conflict.http===409,"M1_BAD_DEDUP_CONFLICT");
   must(s.receipts.length===1,"M1_RECEIPT_DUPLICATED");
   return {duplicateHttp:200,conflictHttp:409,uniqueReceipts:s.receipts.length};
  });
  await step("M1_05_SIGKILL_RECOVER_REOPEN",async()=>{
   await stopDaemon(one,"SIGKILL");one=null;
   two=await startDaemon(file,token);
   const s=await request(two,token,"state");
   must(s.identity.sessionId!==initialSession,"M1_SESSION_NOT_ROTATED");
   must(s.receipts.length===1&&s.receipts[0].receiptId==="M1-001","M1_LOST_RECEIPT_ON_KILL");
   const d=await request(two,token,"receipts",{receiptId:"M1-001",packageId:"BOX-001"});
   must(d.http===200&&d.duplicate===true,"M1_RESTART_DEDUP_FAILED");
   return {realProcessSigkill:true,sessionRotated:true,receiptId:s.receipts[0].receiptId,
    receiptEventId:s.receipts[0].eventId,receiptRetained:true,duplicateAfterRestart:true,
    pending:s.storage.pending};
  });
  await step("M1_06_RECONNECT_AND_AMBIGUOUS_ACK",async()=>{
   const up=await request(two,token,"lab/wan",{id:"primary",upstream:true});
   const tick=await request(two,token,"lab/sample",{});
   const connected=await request(two,token,"state");
   must(up.http===200&&tick.http===200&&connected.network.selectedWan==="primary","M1_WAN_RECOVERY_FAILED");
   const before=connected.storage.pending;
   const f=await request(two,token,"lab/cloud/fault",{fault:"drop-next-ack"});
   const first=await request(two,token,"lab/sync",{});
   const after=await request(two,token,"state");
   must(f.http===200&&first.http===409&&first.result?.error==="REMOTE_ACK_LOST",
    "M1_MISSING_AMBIGUOUS_ACK");
   must(after.storage.pending===before&&after.labCloud.stored>=1,"M1_FALSE_ACK_CURSOR_ADVANCE");
   return {wan:"primary",cloudMock:true,error:first.result.error,
    pendingBefore:before,pendingAfter:after.storage.pending,remoteMockStored:after.labCloud.stored};
  });
  await step("M1_07_RETRY_AND_DURABLE_CURSOR",async()=>{
   const r=await request(two,token,"lab/sync",{}),s=await request(two,token,"state");
   must(r.http===200&&r.result?.status==="SYNC_OK"&&r.result.duplicates>=1&&r.result.remaining===0,
    "M1_CLOUD_RETRY_OR_DEDUP_FAILED");
   must(s.storage.pending===0&&s.receipts[0].cloudAcked===true,"M1_LOCAL_ACK_NOT_DURABLE");
   return {status:r.result.status,acked:r.result.acked,replayDuplicates:r.result.duplicates,
    pending:s.storage.pending,cloudAcked:s.receipts[0].cloudAcked,remoteMockStored:s.labCloud.stored};
  });
  finalState=await request(two,token,"state");
 }catch(e){error=String(e.message||e);}
 finally{
  await stopDaemon(one);await stopDaemon(two);
  fs.rmSync(workspace,{recursive:true,force:true});
 }
 const required=["M1_01_AUTONOMOUS_EDGE_RUNNING","M1_02_VIRTUAL_WAN_LOCAL_ONLY",
  "M1_03_OFFLINE_RECEIPT_FSYNC","M1_04_IDEMPOTENCY_AND_CONFLICT",
  "M1_05_SIGKILL_RECOVER_REOPEN","M1_06_RECONNECT_AND_AMBIGUOUS_ACK",
  "M1_07_RETRY_AND_DURABLE_CURSOR"];
 const ok=!error&&trace.length===required.length&&trace.every((t,i)=>t.pass&&t.id===required[i]);
 const report={kind:"PEF_M1_END_TO_END_EVIDENCE_V1",schemaVersion:1,runId,
  commit:gitCommit(),createdAt,completedAt:new Date().toISOString(),
  profile:{platform:process.platform,arch:process.arch,node:process.version,
   source:"REAL_STANDALONE_NODE_DAEMON_ON_LOOPBACK",wan:"VIRTUAL",cloud:"EPHEMERAL_MOCK"},
  ok,status:ok?"M1_FUNCTIONAL_LAB_PASS":"M1_FUNCTIONAL_LAB_BLOCKED",
  checks:trace.map(({id,pass,durationMs})=>({id,pass,durationMs})),error,
  final:finalState?{pending:finalState.storage.pending,receiptCount:finalState.receipts.length,
    cloudMockStored:finalState.labCloud.stored}:null,
  limits:{physicalValidated:false,realWANValidated:false,realCloudValidated:false,
   powerCutValidated:false,cloudLiteProvisioned:false,full72hValidated:false,
   standaloneProductionAuthorized:false,cloudMock:true,
   realProcessSigkill:trace.some(t=>t.id===required[4]&&t.pass)}};
 return {report,trace};
}
module.exports={runM1Scenario};
