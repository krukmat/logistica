"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createDashboardServer}=require("../src/emulator/dashboard-server.js");
async function withPanel(fn){
  const app=createDashboardServer({port:0}),url=await app.listen();
  try{
    const boot=await (await fetch(url+"api/bootstrap")).json();
    const call=async body=>{
      const res=await fetch(url+"api/command",{method:"POST",headers:{
        "content-type":"application/json","x-pef-session":boot.token},body:JSON.stringify(body)});
      return {httpStatus:res.status,...await res.json()};
    };
    return await fn({url,boot,call});
  }finally{await app.close();}
}
test("dashboard renders integrated mode and executes same fsync journal as Edge Runtime",()=>withPanel(async({url,boot,call})=>{
  const html=await (await fetch(url)).text();
  assert.match(html,/id="mode-lab"/);
  assert.match(html,/id="lab-restart"/);
  assert.match(html,/id="lab-pending"/);
  assert.equal(boot.mode,"sim");
  assert.equal((await call({command:"lab",action:"sample"})).httpStatus,400);
  const selected=await call({command:"mode",mode:"lab"});
  assert.equal(selected.mode,"lab");
  assert.equal(selected.lab.identity.deviceId,"demo-edge");
  assert.equal(selected.lab.identity.configRevision,"cfg-demo-1");
  assert.equal(selected.lab.physicalValidated,false);
  const first=await call({command:"lab",action:"sample"});
  assert.equal(first.result.event.ack,true);
  assert.equal(first.result.event.fsyncCompleted,true);
  assert.equal(first.lab.storage.pending,1);
  const back=await call({command:"lab",action:"wan",id:"primary",upstream:false});
  assert.equal(back.lab.network.selectedWan,"backup");
  assert.equal(back.result.event.ack,true);
  const offline=await call({command:"lab",action:"wan",id:"backup",upstream:false});
  assert.equal(offline.lab.network.connectivity,"LOCAL_ONLY");
  assert.equal(offline.lab.storage.pending,3);
  assert.equal((await call({command:"lab",action:"sync"})).result.error,"CLOUD_UNAVAILABLE");
  await call({command:"lab",action:"wan",id:"primary",upstream:true});
  const sync=await call({command:"lab",action:"sync"});
  assert.equal(sync.result.status,"SYNC_OK");
  assert.equal(sync.lab.storage.pending,0);
  assert.equal(sync.lab.cloud.stored,4);
  assert.equal((await call({command:"lab",action:"compact"})).result.ok,true);
}));
test("integrated mock cloud lost ACK and forged ACK remain pending until valid replay",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  const first=await call({command:"lab",action:"sample"});
  const session=first.lab.identity.sessionId;
  await call({command:"lab",action:"lostAck"});
  const lost=await call({command:"lab",action:"sync"});
  assert.equal(lost.result.error,"REMOTE_ACK_LOST");
  assert.equal(lost.lab.storage.pending,1);
  assert.equal(lost.lab.cloud.stored,1);
  const restart=await call({command:"lab",action:"restart"});
  assert.notEqual(restart.lab.identity.sessionId,session);
  assert.equal(restart.lab.storage.pending,1);
  await call({command:"lab",action:"forgedAck"});
  const forged=await call({command:"lab",action:"sync"});
  assert.equal(forged.result.error,"INVALID_REMOTE_ACK");
  assert.equal(forged.lab.storage.pending,1);
  const valid=await call({command:"lab",action:"sync"});
  assert.equal(valid.result.status,"SYNC_OK");
  assert.equal(valid.result.duplicates,1);
  assert.equal(valid.lab.storage.pending,0);
  const again=await call({command:"lab",action:"sample"});
  assert.notEqual(first.result.event.eventId,again.result.event.eventId);
}));
test("pressure profile displays unacknowledged P1 events without interrupting WAN",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  const reset=await call({command:"lab",action:"reset",profile:"pressure"});
  assert.equal(reset.lab.storage.capacityBytes,2400);
  await call({command:"lab",action:"sample"});
  await call({command:"lab",action:"wan",id:"primary",upstream:false});
  await call({command:"lab",action:"wan",id:"backup",upstream:false});
  const result=await call({command:"lab",action:"wan",id:"primary",upstream:true});
  assert.equal(result.lab.network.selectedWan,"primary");
  assert.equal(result.result.event.ack,false);
  assert.equal(result.lab.runtimeHealth,"DEGRADED");
  assert.ok(result.lab.volatilePending>0);
}));

test("integrated UI client exposes each operation and Linux-only lab remains labeled CI-only",()=>withPanel(async({url,call})=>{
  const html=await (await fetch(url)).text();
  const client=await (await fetch(url+"dashboard.js")).text();
  for(const id of ["lab-sample","lab-restart","lab-compact","lab-lost-ack",
    "lab-forged-ack","lab-loopback","lab-reset","lab-profile","lab-history","lab-health"]){
    assert.ok(html.includes('id="'+id+'"'),"Missing control "+id);
  }
  for(const action of ["sample","restart","compact","lostAck","forgedAck","loopback","reset"]){
    assert.ok(client.includes('labAction("'+action+'"'),"Control not wired: "+action);
  }
  assert.match(html,/CI-only/);
  assert.match(html,/sin privilegios|sin hardware|sin root|NO ROOT/i);
  assert.equal((await call({command:"lab",action:"sample"})).httpStatus,400);
  assert.equal((await call({command:"mode",mode:"invalid"})).httpStatus,400);
  const enabled=await call({command:"mode",mode:"lab"});
  assert.equal(enabled.lab.capabilities.includes("journal-compaction"),true);
  assert.equal((await call({command:"run"})).httpStatus,400);
  assert.equal((await call({command:"lab",action:"invalid"})).httpStatus,400);
  const back=await call({command:"mode",mode:"sim"});
  assert.equal(back.mode,"sim");
  assert.equal((await call({command:"enqueue",step:{action:"tick",seconds:1}})).httpStatus,200);
}));
test("dashboard loopback button executes real localhost TCP/HTTP lab, no privileged port or NIC",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  const result=await call({command:"lab",action:"loopback"});
  assert.equal(result.httpStatus,200);
  assert.equal(result.result.status,"LAB_PASS",JSON.stringify(result.result.failures));
  assert.equal(result.lab.physicalValidated,false);
  assert.ok(result.lab.history.some(h=>h.action==="loopback"));
}));
test("private journal directory is deleted on integrated lab close",async()=>{
  const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
  const {createDashboardLab}=require("../src/emulator/dashboard-lab.js");
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"pef-ui-lab-fixture-"));
  const lab=createDashboardLab({tmpParent:base});
  try{
    assert.equal(fs.readdirSync(base).length,1);
    await lab.command({action:"sample"});
    assert.equal(lab.snapshot().storage.pending,1);
    await lab.command({action:"reset",profile:"pressure"});
    assert.equal(fs.readdirSync(base).length,1);
    assert.equal(lab.snapshot().storage.capacityBytes,2400);
  }finally{
    lab.close();
    assert.deepEqual(fs.readdirSync(base),[]);
    fs.rmSync(base,{recursive:true,force:true});
  }
});

test("dashboard boot metadata is persisted only in scoped lab directory and rotates epoch on restart",async()=>{
  const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
  const {createDashboardLab}=require("../src/emulator/dashboard-lab.js");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-provisioning-test-"));
  const lab=createDashboardLab({tmpParent:root});
  try{
    const start=lab.snapshot();
    assert.equal(start.boot.metadataFsync,true);
    assert.equal(start.boot.hardwareProvisioned,false);
    assert.equal(start.boot.credentialsProvisioned,false);
    const dir=path.join(root,fs.readdirSync(root)[0]);
    const meta=JSON.parse(fs.readFileSync(path.join(dir,"pef-lab-identity.json"),"utf8"));
    assert.equal(meta.deviceId,"demo-edge");
    assert.equal(meta.provisioning,"LAB_ONLY_NOT_TRUSTED");
    assert.equal(fs.statSync(path.join(dir,"pef-lab-identity.json")).mode&0o077,0);
    const firstId=start.identity.sessionId;
    await lab.command({action:"sample"});
    await lab.command({action:"restart"});
    const next=lab.snapshot();
    assert.notEqual(next.identity.sessionId,firstId);
    assert.equal(next.identity.deviceId,meta.deviceId);
    assert.equal(next.storage.pending,1);
  }finally{lab.close();assert.deepEqual(fs.readdirSync(root),[]);
    fs.rmSync(root,{recursive:true,force:true});}
});

test("P2 dashboard timeout leaves P1 pending; bounded retry accepts deduplicated remote commit",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  await call({command:"lab",action:"sample"});
  const inject=await call({command:"lab",action:"timeout"});
  assert.equal(inject.result.ok,true);
  const result=await call({command:"lab",action:"sync"});
  assert.equal(result.result.status,"SYNC_INCOMPLETE");
  assert.equal(result.result.error,"REMOTE_TIMEOUT");
  assert.equal(result.result.attempts,1);
  assert.equal(result.lab.storage.pending,1);
  assert.equal(result.lab.cloud.stored,1);
  const retried=await call({command:"lab",action:"syncRetry"});
  assert.equal(retried.result.status,"SYNC_OK");
  assert.equal(retried.result.duplicates,1);
  assert.equal(retried.lab.storage.pending,0);
  assert.equal(retried.lab.transport.frame,"PEF-LAB-ACK-v1");
  assert.equal(retried.lab.transport.authenticated,false);
}));
test("P2 dashboard bounded retry repeats the same event after timed-out mock transport",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  await call({command:"lab",action:"sample"});
  await call({command:"lab",action:"timeout"});
  const r=await call({command:"lab",action:"syncRetry"});
  assert.equal(r.result.status,"SYNC_OK");
  assert.equal(r.result.attempts,2);
  assert.equal(r.result.duplicates,1);
  assert.equal(r.lab.storage.pending,0);
}));
test("P2 dashboard missing proof and protocol mismatch never persist local cursor",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  await call({command:"lab",action:"sample"});
  await call({command:"lab",action:"missingProof"});
  let r=await call({command:"lab",action:"sync"});
  assert.equal(r.result.error,"INVALID_REMOTE_PROOF");
  assert.equal(r.lab.storage.pending,1);
  r=await call({command:"lab",action:"sync"});
  assert.equal(r.result.status,"SYNC_OK");
  assert.equal(r.result.duplicates,1);
  r=await call({command:"lab",action:"wan",id:"primary",upstream:false});
  assert.equal(r.lab.storage.pending,1);
  await call({command:"lab",action:"badVersion"});
  r=await call({command:"lab",action:"sync"});
  assert.equal(r.result.error,"INVALID_REMOTE_PROOF");
  assert.equal(r.lab.storage.pending,1);
  r=await call({command:"lab",action:"sync"});
  assert.equal(r.result.status,"SYNC_OK");
  assert.equal(r.lab.storage.pending,0);
}));

test("Q: local HTTP receipt accepted offline, idempotent across restart, replayed and retained",()=>withPanel(async({url,boot,call})=>{
  const api=async body=>{
    const res=await fetch(url+"api/local/receipts",{method:"POST",headers:{
      "content-type":"application/json","x-pef-session":boot.token},body:JSON.stringify(body)});
    return {code:res.status,...await res.json()};
  };
  const list=async()=>fetch(url+"api/local/receipts",{headers:{"x-pef-session":boot.token}}).then(x=>x.json());
  assert.equal((await api({receiptId:"R001",packageId:"PKG001"})).code,409);
  await call({command:"mode",mode:"lab"});
  await call({command:"lab",action:"wan",id:"primary",upstream:false});
  const offline=await call({command:"lab",action:"wan",id:"backup",upstream:false});
  assert.equal(offline.lab.network.connectivity,"LOCAL_ONLY");
  const first=await api({receiptId:"R001",packageId:"PKG001"});
  assert.equal(first.code,201);
  assert.equal(first.result.accepted,true);
  assert.equal(first.result.fsyncCompleted,true);
  assert.equal(first.lab.receipts.length,1);
  assert.equal(first.lab.receipts[0].cloudAcked,false);
  assert.equal((await api({receiptId:"R001",packageId:"PKG001"})).code,200);
  const conflict=await api({receiptId:"R001",packageId:"PKG002"});
  assert.equal(conflict.code,409);
  assert.equal(conflict.result.error,"EVENT_ID_CONFLICT");
  assert.equal((await list()).receipts.length,1);
  assert.equal((await call({command:"lab",action:"sync"})).result.error,"CLOUD_UNAVAILABLE");
  await call({command:"lab",action:"restart"});
  assert.equal((await list()).receipts[0].receiptId,"R001");
  await call({command:"lab",action:"wan",id:"primary",upstream:true});
  const sync=await call({command:"lab",action:"sync"});
  assert.equal(sync.result.status,"SYNC_OK");
  assert.equal(sync.lab.receipts[0].cloudAcked,true);
  assert.equal(sync.lab.storage.pending,0);
  assert.equal((await call({command:"lab",action:"compact"})).result.ok,true);
  assert.equal((await list()).receipts[0].cloudAcked,true);
  assert.equal((await api({receiptId:"R001",packageId:"PKG001"})).result.duplicate,true);
}));
test("Q: invalid/over-quota local receipt never falsely ACKed; API requires local session",()=>withPanel(async({url,boot,call})=>{
  const path=url+"api/local/receipts";
  assert.equal((await fetch(path)).status,403);
  assert.equal((await fetch(path,{method:"POST",headers:{"content-type":"application/json"},
    body:'{"receiptId":"R","packageId":"P"}'})).status,403);
  await call({command:"mode",mode:"lab"});
  const post=async id=>{
    const res=await fetch(path,{method:"POST",headers:{"content-type":"application/json",
      "x-pef-session":boot.token},body:JSON.stringify({receiptId:id,packageId:"PKG-"+id})});
    return {code:res.status,...await res.json()};
  };
  assert.equal((await post("../invalid")).code,400);
  await call({command:"lab",action:"reset",profile:"pressure"});
  let failed=null,accepted=0;
  for(let i=0;i<20;i++){
    const r=await post("R"+i);
    if(r.code===507){failed=r;break;}
    assert.equal(r.code,201);accepted++;
  }
  assert.ok(failed);
  assert.equal(failed.result.accepted,false);
  assert.equal(failed.result.fsyncCompleted,false);
  assert.equal(failed.lab.receipts.length,accepted);
  const html=await (await fetch(url)).text(),js=await (await fetch(url+"dashboard.js")).text();
  for(const id of ["receipt-id","package-id","receive-package","receipt-count","receipt-list"])
    assert.ok(html.includes('id="'+id+'"'));
  assert.ok(js.includes('fetch("/api/local/receipts"'));
}));

test("Q: lost remote ACK for accepted receipt is retried without duplicate Cloud commit",()=>withPanel(async({url,boot,call})=>{
  await call({command:"mode",mode:"lab"});
  await call({command:"lab",action:"sample"});
  assert.equal((await call({command:"lab",action:"sync"})).result.status,"SYNC_OK");
  const response=await fetch(url+"api/local/receipts",{method:"POST",headers:{
    "content-type":"application/json","x-pef-session":boot.token},
    body:JSON.stringify({receiptId:"R-AMBIG",packageId:"PKG-AMBIG"})});
  assert.equal(response.status,201);
  await call({command:"lab",action:"lostAck"});
  const uncertain=await call({command:"lab",action:"sync"});
  assert.equal(uncertain.result.error,"REMOTE_ACK_LOST");
  assert.equal(uncertain.lab.receipts.length,1);
  assert.equal(uncertain.lab.receipts[0].cloudAcked,false);
  const replay=await call({command:"lab",action:"sync"});
  assert.equal(replay.result.status,"SYNC_OK");
  assert.equal(replay.result.duplicates,1);
  assert.equal(replay.lab.receipts[0].cloudAcked,true);
}));

test("T emulator offers actual standalone daemon smoke via HTTP and displays its recovery evidence",()=>withPanel(async({url,call})=>{
  const html=await (await fetch(url)).text(),js=await (await fetch(url+"dashboard.js")).text();
  for(const id of ["standalone-edge-panel","edge-autonomous-smoke","edge-autonomous-evidence"])
    assert.ok(html.includes('id="'+id+'"'),"Missing daemon UI "+id);
  assert.ok(js.includes('labAction("autonomousSmoke")'));
  await call({command:"mode",mode:"lab"});
  const smoke=await call({command:"lab",action:"autonomousSmoke"});
  assert.equal(smoke.result.ok,true,JSON.stringify(smoke.result));
  assert.equal(smoke.result.retainedAfterRestart,true);
  assert.equal(smoke.result.fsyncCompleted,true);
  assert.equal(smoke.lab.standaloneEdge.lastEvidence.status,"LAB_PASS");
  assert.equal(smoke.lab.standaloneEdge.physicalValidated,false);
}));

test("W1.10.A dashboard invokes real predevice port conformance and labels physical blocked",()=>withPanel(async({url,call})=>{
 const html=await (await fetch(url)).text(),js=await (await fetch(url+"dashboard.js")).text();
 for(const id of ["predevice-panel","predevice-conformance","predevice-evidence"])
   assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
 assert.ok(js.includes('labAction("predeviceConformance")'));
 await call({command:"mode",mode:"lab"});
 const report=await call({command:"lab",action:"predeviceConformance"});
 assert.equal(report.result.status,"LAB_PASS",JSON.stringify(report.result.checks.filter(x=>!x.pass)));
 assert.equal(report.result.total,34);
 assert.ok(report.result.checks.some(x=>x.id==="STORAGE_FSYNC_AMBIGUITY_IDEMPOTENT_RECOVERY"&&x.pass));
 assert.ok(report.result.checks.some(x=>x.id==="STORAGE_PARTIAL_WRITE_QUARANTINE"&&x.pass));
 assert.ok(report.result.checks.some(x=>x.id==="PORT_HUNG_ROUTE_REMAINS_BLOCKED"&&x.pass));
 assert.ok(report.result.checks.some(x=>x.id==="PORT_BOOT_ROUTE_RECONCILIATION"&&x.pass));
 assert.equal(report.lab.predevice.lastEvidence.status,"LAB_PASS");
 assert.equal(report.lab.predevice.deviceBackend,"BACKEND_NOT_IMPLEMENTED");
 assert.equal(report.lab.predevice.physicalValidated,false);
 assert.ok(report.lab.history.some(x=>x.action==="predevice-conformance"));
}));

test("W1.10.B4 dashboard executes golden Core trace oracle and exposes evidence",()=>withPanel(async({url,call})=>{
 const html=await (await fetch(url)).text(),js=await (await fetch(url+"dashboard.js")).text();
 for(const id of ["golden-traces","golden-traces-evidence"])
   assert.ok(html.includes('id="'+id+'"'),"Missing B4 UI "+id);
 assert.ok(js.includes('labAction("goldenTraces")'));
 await call({command:"mode",mode:"lab"});
 const run=await call({command:"lab",action:"goldenTraces"});
 assert.equal(run.httpStatus,200,JSON.stringify(run.result));
 assert.equal(run.result.status,"LAB_PASS",JSON.stringify(run.result.comparison));
 assert.equal(run.result.traces.scenarios.length,4);
 assert.equal(run.lab.goldenTraces.lastEvidence.canonicalSha256,run.result.baselineSha256);
 assert.equal(run.lab.goldenTraces.physicalValidated,false);
 assert.ok(run.lab.history.some(x=>x.action==="golden-traces"));
}));

test("W1.10.C1 authenticated dashboard runs safe boot/device preflight with physical gate blocked",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),js=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["device-preflight","device-preflight-evidence"])
   assert.ok(html.includes('id="'+id+'"'),"C1 UI missing "+id);
 assert.ok(js.includes('labAction("devicePreflight")'));
 await call({command:"mode",mode:"lab"});
 const report=await call({command:"lab",action:"devicePreflight",
   claims:{"C1_LINUX_RUNTIME":"DEVICE_PASS"},deviceApproved:true});
 assert.equal(report.httpStatus,200,JSON.stringify(report.result));
 assert.equal(report.result.status,"LAB_PASS",JSON.stringify(report.result.checks.filter(x=>!x.pass)));
 assert.equal(report.result.passed,9);
 assert.equal(report.result.device.status,"DEVICE_BLOCKED");
 assert.equal(report.result.device.productionAuthorized,false);
 assert.equal(report.result.deviceBackend,"BACKEND_NOT_IMPLEMENTED");
 assert.equal(report.lab.devicePreflight.lastEvidence.status,"LAB_PASS");
 assert.equal(report.lab.devicePreflight.productionAuthorized,false);
 assert.ok(report.lab.history.some(x=>x.action==="device-preflight"));
}));

test("W1.10.C2 dashboard screens evidence-grounded candidates and measures only local temporary fsync",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),js=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["hardware-screening","hardware-screening-evidence"])
   assert.ok(html.includes('id="'+id+'"'),"Missing C2 UI "+id);
 assert.ok(js.includes('labAction("hardwareScreening")'));
 await call({command:"mode",mode:"lab"});
 const run=await call({command:"lab",action:"hardwareScreening",hardwareApproved:true});
 assert.equal(run.httpStatus,200,JSON.stringify(run.result));
 assert.equal(run.result.status,"LAB_PASS_PHYSICAL_BLOCKED");
 assert.equal(run.result.shortlist.candidates.length,3);
 assert.deepEqual(run.result.shortlist.firstInvestigationCandidates,[]);
 assert.equal(run.result.shortlist.singlePrototypeStatus,"NO_CONFIRMED_CHEAP_ONE_UNIT_PEF");
 assert.equal(run.result.recommendedFirstPhysicalProbe,null);
 assert.equal(run.result.preferredVolumeDesignCandidate,"seeed-linkstar-h28k-0408");
 assert.equal(run.result.physical.canEnableDevice,false);
 assert.equal(run.result.observation.physicalValidated,false);
 assert.equal(run.result.physicalValidated,false);
 assert.equal(run.lab.hardwareCandidates.lastEvidence.status,"LAB_PASS_PHYSICAL_BLOCKED");
 assert.ok(run.lab.history.some(x=>x.action==="hardware-screening"));
}));


test("D4 control panel offers read-only ARM64 guest evidence import without physical GO",()=>withPanel(async({url})=>{
 const html=await(await fetch(url)).text(),client=await(await fetch(url+"dashboard.js")).text();
 assert.ok(html.includes('id="arm64-comparison-file"'));
 assert.ok(html.includes('id="arm64-comparison-evidence"'));
 assert.ok(html.includes("no certifican hardware físico"));
 assert.ok(client.includes("PEF_ARM64_VIRTUAL_FIT_COMPARISON_V1"));
 assert.ok(client.includes("file.text()"));
 assert.ok(client.includes("reportIntegrityIndependentlyVerified:false"));
 assert.ok(client.includes("physicalHardwareApproved:false"));
}));


test("D4 prominent ARM64 button navigates to first dedicated integrated-lab block",()=>withPanel(async({url})=>{
 const html=await(await fetch(url)).text(),client=await(await fetch(url+"dashboard.js")).text();
 assert.ok(html.includes('id="open-arm64-lab"'));
 assert.ok(html.includes('id="arm64-lab-panel"'));
 assert.ok(html.indexOf('id="arm64-lab-panel"')<html.indexOf('id="predevice-panel"'));
 assert.equal((html.match(/id="arm64-comparison-file"/g)||[]).length,1);
 assert.ok(client.includes('$("arm64-lab-panel").scrollIntoView'));
 assert.ok(client.includes('await dispatch({command:"mode",mode:"lab"})'));
}));


test("E5 dashboard imports only local fail-closed research artifact, no hardware GO",()=>withPanel(async({url})=>{
 const html=await(await fetch(url)).text(),script=await(await fetch(url+"dashboard.js")).text();
 assert.match(html,/id="arm64-e5-file"/);assert.match(html,/id="arm64-e5-evidence"/);
 assert.match(script,/PEF_W1_10_E5_VIRTUAL_HARDWARE_GATE_V1/);
 assert.match(script,/purchasedOrDeviceApproved:false/);
 assert.match(script,/file\.text\(\)/);
}));


test("F1/F2 dashboard locally imports explicit virtual reports without 72h or device claims",()=>withPanel(async({url})=>{
 const html=await(await fetch(url)).text(),script=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["arm64-f1-file","arm64-f2-file","arm64-f1-evidence","arm64-f2-evidence"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.ok(script.includes("PEF_F1_JOURNAL_INDEX_SCALE_V1"));
 assert.ok(script.includes("PEF_F2_72H_RETENTION_POLICY_V1"));
 assert.ok(script.includes("retention72hProven:false"));
 assert.ok(script.includes("actual72hValidated:false"));
}));


test("M1 dashboard read-only report + trace import labels synthetic WAN/cloud and never authenticates physical evidence",()=>withPanel(async({url})=>{
 const html=await(await fetch(url)).text(),js=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m1-report-file","m1-trace-file","m1-evidence"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/M1_IMPORT_NOT_SAME_RUN_OR_UNSAFE/);
 assert.match(js,/SHA256 NOT VERIFIED IN BROWSER/);
 assert.match(js,/physicalValidated/);
}));

test("M3 dashboard exercises real supervisor, SIGKILL/reopen and labels Linux kernel exclusivity CI-only",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),client=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m3-lifecycle-smoke","m3-lifecycle-evidence"])assert.ok(html.includes('id="'+id+'"'));
 assert.match(client,/labAction\("m3Lifecycle"\)/);
 await call({command:"mode",mode:"lab"});
 const e=await call({command:"lab",action:"m3Lifecycle"});
 assert.equal(e.result.ok,true,JSON.stringify(e.result));
 assert.equal(e.result.actualProcessSigkill,true);
 assert.equal(e.result.receiptRetained,true);
 assert.equal(e.result.stoppedGracefully,true);
 assert.equal(e.lab.m3Lifecycle.physicalValidated,false);
 assert.equal(e.lab.m3Lifecycle.linuxKernelLock,"CI_ONLY");
}));

test("M3.3/4 dashboard calls real managed Edge config, rollback and safe-mode test",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text();
 const js=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m3-recovery-smoke","m3-recovery-evidence"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/labAction\("m3Recovery"\)/);
 await call({command:"mode",mode:"lab"});
 const result=await call({command:"lab",action:"m3Recovery"});
 assert.equal(result.result.status,"LAB_PASS",JSON.stringify(result.result));
 assert.equal(result.result.revision,2);
 assert.equal(result.result.checks.HEALTH_ROLLBACK,true);
 assert.equal(result.result.checks.SAFE_MODE_ON_RESTART_EXHAUSTION,true);
 assert.equal(result.lab.m3Recovery.physicalValidated,false);
 assert.equal(result.lab.m3Recovery.remoteRecoveryAllowed,false);
}));

test("M3.5/6 dashboard invokes real diagnostics through HTTP",()=>withPanel(async({url,call})=>{
 const html=await (await fetch(url)).text();
 const js=await (await fetch(url+"dashboard.js")).text();
 assert.ok(html.includes('id="m3-operations-smoke"'));
 assert.ok(html.includes('id="m3-operations-evidence"'));
 assert.match(js,/labAction\("m3Operations"\)/);
 await call({command:"mode",mode:"lab"});
 const changed=await call({command:"lab",action:"m3Operations"});
 assert.equal(changed.result.ok,true);
 assert.equal(changed.result.diagnosticSnapshots.length,4);
 assert.equal(changed.result.diagnosticSnapshots[2].phase,"SAFE_MODE");
 assert.equal(changed.result.diagnosticSnapshots[3].phase,"RUNNING");
 assert.equal(changed.lab.m3Operations.physicalValidated,false);
 assert.equal(changed.lab.m3Operations.remoteRecoveryAllowed,false);
}));

test("M4.1 dashboard HTTP invokes real Property Edge offline ACK/restart/replay",()=>withPanel(async({url,call})=>{
 const html=await (await fetch(url)).text(),js=await (await fetch(url+"dashboard.js")).text();
 assert.match(html,/id="m4-property-smoke"/);
 assert.match(js,/labAction\("propertySmoke"\)/);
 await call({command:"mode",mode:"lab"});
 const result=await call({command:"lab",action:"propertySmoke"});
 assert.equal(result.httpStatus,200);
 assert.equal(result.result.status,"LAB_PASS",JSON.stringify(result.result));
 assert.equal(result.result.checks.RESTART_RESTORES_INCIDENT,true);
 assert.equal(result.result.checks.MOCK_REPLAY,true);
 assert.equal(result.lab.property.lastEvidence.status,"LAB_PASS");
 assert.equal(result.lab.property.physicalValidated,false);
}));

test("M4.2 dashboard HTTP action runs Host standalone Edge and common Site Operations",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),js=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["host-overlay-panel","m4-host-smoke","m4-host-evidence"])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/labAction\("hostSmoke"\)/);
 await call({command:"mode",mode:"lab"});
 const result=await call({command:"lab",action:"hostSmoke"});
 assert.equal(result.httpStatus,200);
 assert.equal(result.result.status,"LAB_PASS",JSON.stringify(result.result));
 assert.equal(result.result.checks.RESTART_RESTORES_INCIDENT,true);
 assert.equal(result.result.checks.MOCK_REPLAY,true);
 assert.equal(result.lab.host.lastEvidence.status,"LAB_PASS");
 assert.equal(result.lab.host.lastEvidence.sharedEngine,"src/core/site-operations.js");
 assert.equal(result.lab.host.physicalValidated,false);
}));

test("M4.3 dashboard HTTP action runs same Core recovery/fault/metrics matrix",()=>withPanel(async({url,call})=>{
 const html=await (await fetch(url)).text(),js=await (await fetch(url+"dashboard.js")).text();
 for(const id of ["m4-commonality-panel","m4-commonality-run","m4-commonality-evidence"])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/labAction\("m4Commonality"\)/);
 await call({command:"mode",mode:"lab"});
 const report=await call({command:"lab",action:"m4Commonality"});
 assert.equal(report.httpStatus,200);
 assert.equal(report.result.status,"LAB_PASS",JSON.stringify(report.result));
 assert.equal(report.result.parity.checks.LEGACY_PROPERTY_ENVELOPE,true);
 assert.equal(report.result.profiles.property.runtime.checks.REAL_CHILD_RESTART,true);
 assert.equal(report.result.profiles.host.runtime.checks.MOCK_DUPLICATE_REPLAY,true);
 assert.equal(report.result.profiles.host.storage.checks.FSYNC_FAILURE_NO_ACK,true);
 assert.equal(report.lab.m4Commonality.lastEvidence.status,"LAB_PASS");
 assert.equal(report.lab.m4Commonality.physicalValidated,false);
}));

test("M4.4 dashboard HTTP runs one integrated Edge scenario and shows verified bundle",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),client=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m4-integrated-panel","m4-integrated-run","m4-integrated-evidence"])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(client,/labAction\("m4Integrated"\)/);
 await call({command:"mode",mode:"lab"});
 const response=await call({command:"lab",action:"m4Integrated"});
 assert.equal(response.httpStatus,200);
 assert.equal(response.result.kind,"PEF_M4_BUNDLE_VERIFIED_V1");
 assert.equal(response.result.ok,true);
 assert.equal(response.result.assertions,92);
 assert.equal(response.result.property,"LAB_PASS");
 assert.equal(response.result.host,"LAB_PASS");
 assert.equal(response.result.commonality,"LAB_PASS");
 assert.match(response.result.bundleDir,/run-/);
 assert.equal(response.result.signatureValidated,false);
 assert.equal(response.lab.m4Integrated.lastEvidence.runId,response.result.runId);
 assert.equal(response.lab.m4Integrated.physicalValidated,false);
}));

test("M5 dashboard HTTP invokes real packaged Edge install/upgrade/rollback without physical claims",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),js=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m5-install-panel","m5-install-run","m5-install-evidence"])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/labAction\("m5InstallLab"\)/);
 await call({command:"mode",mode:"lab"});
 const res=await call({command:"lab",action:"m5InstallLab"});
 assert.equal(res.httpStatus,200);
 assert.equal(res.result.status,"LAB_PASS",JSON.stringify(res.result));
 assert.equal(res.result.checks.ROLLBACK_PRESERVES_JOURNAL,true);
 assert.equal(res.result.checks.INTERRUPTED_UPGRADE_RETAINS_ACTIVE,true);
 assert.equal(res.result.systemdActivated,false);
 assert.equal(res.lab.m5Install.lastEvidence.status,"LAB_PASS");
 assert.equal(res.lab.m5Install.physicalValidated,false);
}));

test("M5.4 dashboard HTTP validates real systemd unit composition but never activates Mac service",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),client=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m54-systemd-panel","m54-systemd-run","m54-systemd-evidence"])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(client,/labAction\("m54Systemd"\)/);
 await call({command:"mode",mode:"lab"});
 const response=await call({command:"lab",action:"m54Systemd"});
 assert.equal(response.httpStatus,200);
 assert.equal(response.result.ok,true);
 assert.equal(response.result.kind,"PEF_M54_SYSTEMD_CONTRACT_V1");
 assert.match(response.result.unit,/Restart=on-failure/);
 assert.equal(response.result.activation,"NOT_RUN");
 assert.equal(response.lab.m54Systemd.systemdActivatedLocally,false);
 assert.equal(response.lab.m54Systemd.fullVmRebootValidated,false);
}));

test("M5.5 dashboard reports per-overlay isolation budgets and CI-only kernel state",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),client=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m55-isolation-panel","m55-isolation-run","m55-isolation-evidence"])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(client,/labAction\("m55Isolation"\)/);
 await call({command:"mode",mode:"lab"});
 const response=await call({command:"lab",action:"m55Isolation"});
 assert.equal(response.httpStatus,200);
 assert.equal(response.result.status,"LAB_PASS_CONTRACT_ONLY");
 assert.equal(response.result.profiles.property.cpuMax,"15000 100000");
 assert.equal(response.result.profiles.host.cpuMax,"18000 100000");
 assert.equal(response.result.linuxKernelLimitsObservedHere,false);
 assert.equal(response.lab.m55Isolation.macKernelTest,"NOT_RUN_BLOCKED");
}));

test("M5.6 dashboard API inspects package + Linux systemd/kernel contracts without privileged Mac execution",()=>withPanel(async({url,call})=>{
 const html=await(await fetch(url)).text(),client=await(await fetch(url+"dashboard.js")).text();
 for(const id of ["m56-integration-panel","m56-integration-run","m56-integration-evidence"])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(client,/labAction\("m56Integration"\)/);
 await call({command:"mode",mode:"lab"});
 const response=await call({command:"lab",action:"m56Integration"});
 assert.equal(response.httpStatus,200);
 assert.equal(response.result.ok,true);
 assert.equal(response.result.status,"LAB_PASS_CONTRACT_ONLY");
 assert.equal(response.result.checks.PACKAGED_LAB_ENTRYPOINT,true);
 assert.equal(response.result.profilePlans.host.cpuMax,"18000 100000");
 assert.equal(response.result.localKernelExecution,"NOT_RUN_BLOCKED");
 assert.equal(response.lab.m56Integration.kernelValidatedLocally,false);
}));
