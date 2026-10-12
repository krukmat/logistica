"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createDashboardServer}=require("../src/emulator/dashboard-server.js");
async function withPanel(fn){
 const app=createDashboardServer({port:0}),url=await app.listen();
 try{
   const boot=await (await fetch(url+"api/bootstrap")).json();
   const send=async data=>{
     const response=await fetch(url+"api/command",{method:"POST",headers:{
       "content-type":"application/json","x-pef-session":boot.token},body:JSON.stringify(data)});
     return {code:response.status,...await response.json()};
   };
   return await fn({url,boot,send});
 }finally{await app.close();}
}
test("S1-S2 UI→HTTP→Core manager→allowlisted child→IPC receipt→P1 offline, then stop",()=>withPanel(async({url,send})=>{
 const html=await (await fetch(url)).text();
 const js=await (await fetch(url+"dashboard.js")).text();
 for(const id of ["workload-start","workload-stop","workload-crash","workload-reconcile",
    "workload-receipt","workload-status","workload-scope"])
   assert.ok(html.includes('id="'+id+'"'),"Missing UI "+id);
 for(const action of ["workloadStart","workloadStop","workloadCrash","workloadReconcile","workloadReceipt"])
   assert.ok(js.includes('labAction("'+action+'"'),"Missing bound action "+action);
 const lab=await send({command:"mode",mode:"lab"});
 assert.equal(lab.code,200);
 await send({command:"lab",action:"wan",id:"primary",upstream:false});
 const off=await send({command:"lab",action:"wan",id:"backup",upstream:false});
 assert.equal(off.lab.network.connectivity,"LOCAL_ONLY");
 const started=await send({command:"lab",action:"workloadStart"});
 assert.equal(started.result.ok,true,JSON.stringify(started.result));
 assert.equal(started.lab.workloads.entries[0].state,"RUNNING");
 assert.equal(started.lab.workloads.actualLimitsEnforced,false);
 assert.equal(started.lab.workloads.linuxIsolationValidated,false);
 const received=await send({command:"lab",action:"workloadReceipt",receiptId:"S001",packageId:"BOX001"});
 assert.equal(received.result.accepted,true);
 assert.equal(received.result.fsyncCompleted,true);
 assert.equal(received.lab.receipts.length,1);
 const dup=await send({command:"lab",action:"workloadReceipt",receiptId:"S001",packageId:"BOX001"});
 assert.equal(dup.result.duplicate,true);
 const stopped=await send({command:"lab",action:"workloadStop"});
 assert.equal(stopped.result.state,"STOPPED");
 assert.equal(stopped.lab.workloads.entries.length,0);
 const denied=await send({command:"lab",action:"workloadReceipt",receiptId:"S002",packageId:"BOX002"});
 assert.equal(denied.result.error,"WORKLOAD_NOT_RUNNING");
 assert.equal(denied.lab.receipts.length,1);
}));

test("S5 displays CI-only S3 evidence separate from unsandboxed Mac child and polls supervisor",async()=>{
 const {createDashboardServer}=require("../src/emulator/dashboard-server.js");
 const app=createDashboardServer({port:0}),url=await app.listen();
 try{
   const html=await (await fetch(url)).text();
   const js=await (await fetch(url+"dashboard.js")).text();
   assert.match(html,/S3.4–S3.6 Supervisor.*LAB_PASS \(CI-only\)/);
   assert.match(html,/CPU\/RAM\/FS\/red NO aislados/);
   assert.match(html,/actions\/workflows\/pef-emulator.yml/);
   assert.ok(js.includes('fetch("/api/state"'),"No automatic live workload status refresh");
 }finally{await app.close();}
});

test("S3.7 UI exposes real supervised Linux evidence without claiming sandbox on the Mac",()=>withPanel(async({url,send})=>{
  const html=await (await fetch(url)).text(),client=await (await fetch(url+"dashboard.js")).text();
  assert.ok(html.includes('id="workload-linux-evidence-status"'));
  assert.ok(html.includes("Supervisor → Linux Driver → proceso aislado"));
  assert.ok(html.includes("actions/runs/38299458656"));
  assert.ok(client.includes('lab.workloads.linuxCiEvidence'));
  const enabled=await send({command:"mode",mode:"lab"});
  assert.equal(enabled.lab.workloads.actualLimitsEnforced,false);
  assert.equal(enabled.lab.workloads.linuxIsolationValidated,false);
  assert.equal(enabled.lab.workloads.linuxCiEvidence.localProcessIsolated,false);
  assert.equal(enabled.lab.workloads.linuxCiEvidence.supervisorIntegrated,true);
  assert.equal(enabled.lab.workloads.linuxCiEvidence.state,"LAB_PASS_CI_ONLY");
}));
