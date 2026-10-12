"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createEdgeRuntime}=require("../src/emulator/lab/edge-runtime.js");
const {createFileJournal}=require("../src/emulator/lab/file-journal.js");
async function sandbox(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-integrated-"));
  try{return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function adapters(){
  const wan={primary:{link:true,upstream:true},backup:{link:true,upstream:true}};
  const applied=[];
  return {wan,applied,probe:async id=>({...wan[id],reason:"TEST"}),
    applyRoute:async selection=>{applied.push(selection);}};
}
test("integrated controller persists observed WAN and LOCAL_ONLY transitions before claiming ACK",()=>sandbox(async dir=>{
  const a=adapters();
  const edge=createEdgeRuntime({dir,probe:a.probe,applyRoute:a.applyRoute,
    sessionId:"test-one",journalOptions:{capacityBytes:16384,controlReserveBytes:2048},
    simulatorOptions:{failbackHoldSeconds:2}});
  let step=await edge.sample(1);
  assert.equal(step.observed.selectedWan,"primary");
  assert.equal(step.event.ack,true);
  assert.equal(step.event.fsyncCompleted,true);
  a.wan.primary.upstream=false;
  step=await edge.sample(1);
  assert.equal(step.observed.selectedWan,"backup");
  assert.equal(step.event.ack,true);
  a.wan.backup.upstream=false;
  step=await edge.sample(1);
  assert.equal(step.observed.connectivity,"LOCAL_ONLY");
  assert.equal(step.event.ack,true);
  assert.equal(step.runtimeHealth,"HEALTHY");
  const noChange=await edge.sample(1);
  assert.equal(noChange.event,null);
  assert.deepEqual(a.applied,["primary","backup",null,null]);
  const journalPath=edge.journalPath;
  edge.close();
  const reopened=createFileJournal({dir,capacityBytes:16384,controlReserveBytes:2048});
  const pending=reopened.pending();
  assert.equal(pending.length,3);
  assert.deepEqual(pending.map(e=>e.category),["O2","O1","O1"]);
  assert.ok(pending.every(e=>e.payload.appliedToAdapter===true));
  assert.equal(reopened.file,journalPath);
  reopened.close();
}));
test("P1 pressure never claims an ACK and must not block LAN/route decision",()=>sandbox(async dir=>{
  const a=adapters();
  const edge=createEdgeRuntime({dir,probe:a.probe,applyRoute:a.applyRoute,
    sessionId:"tight",journalOptions:{capacityBytes:512,controlReserveBytes:128}});
  const first=await edge.sample(1);
  a.wan.primary.upstream=false;
  const backup=await edge.sample(1);
  a.wan.backup.upstream=false;
  const local=await edge.sample(1);
  assert.equal(local.observed.connectivity,"LOCAL_ONLY");
  assert.equal(local.observed.selectedWan,null);
  assert.ok(a.applied.includes(null));
  assert.equal(edge.status().runtimeHealth,"DEGRADED");
  assert.ok([first,backup,local].some(s=>s.event?.ack===false));
  assert.ok(edge.status().volatilePending>0);
  edge.close();
}));
test("route adapter failure prevents false journal evidence",()=>sandbox(async dir=>{
  const a=adapters();
  const edge=createEdgeRuntime({dir,probe:a.probe,applyRoute:async()=>{throw Error("TEST_ROUTE_DOWN");}});
  await assert.rejects(()=>edge.sample(1),/TEST_ROUTE_DOWN/);
  assert.equal(edge.status().storage.events,0);
  edge.close();
}));
test("cloud ACK and compaction preserve critical event after integrated runtime stops",()=>sandbox(async dir=>{
  const a=adapters();
  const edge=createEdgeRuntime({dir,probe:a.probe,applyRoute:a.applyRoute,sessionId:"audit",
    journalOptions:{capacityBytes:16384}});
  await edge.sample(1);
  a.wan.primary.upstream=false;
  const backup=await edge.sample(1);
  assert.equal(backup.event.ack,true);
  assert.equal(edge.cloudAck(backup.event.eventId).ack,true);
  assert.equal(edge.compact().ok,true);
  edge.close();
  const check=createFileJournal({dir,capacityBytes:16384});
  assert.equal(check.cloudAck(backup.event.eventId).duplicate,true);
  assert.equal(check.status().pending,1);
  check.close();
}));
