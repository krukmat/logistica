"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createEdgeRuntime}=require("../src/emulator/lab/edge-runtime.js");
const {createFileJournal}=require("../src/emulator/lab/file-journal.js");
const {createLabCloudReplica,syncJournal}=require("../src/emulator/lab/cloud-replay.js");
const {eventChecksum}=require("../src/emulator/lab/event-envelope.js");
const identity={siteId:"lab-site",deviceId:"lab-device",configRevision:"cfg-1"};
async function sandbox(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-cloud-"));
  try{return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function ports(){
  const wan={primary:{link:true,upstream:true},backup:{link:true,upstream:true}};
  return {wan,probe:async w=>({...wan[w],reason:"TEST"}),applyRoute:async()=>{}};
}
test("ambiguous durable cloud ACK does not move local cursor; replay deduplicates after reopen",()=>sandbox(async dir=>{
  const {wan,...portsConfig}=ports();
  let edge=createEdgeRuntime({dir,identity,...portsConfig,sessionId:"boot-A"});
  const first=await edge.sample(1);
  wan.primary.upstream=false;
  const second=await edge.sample(1);
  edge.close();
  let journal=createFileJournal({dir});
  const cloud=createLabCloudReplica({siteId:identity.siteId,deviceId:identity.deviceId,
    allowedRevisions:["cfg-1"]});
  cloud.dropNextDurableAck();
  const lost=await syncJournal({journal,transport:cloud,maxEvents:1});
  assert.equal(lost.status,"SYNC_INCOMPLETE");
  assert.equal(lost.error,"REMOTE_ACK_LOST");
  assert.equal(lost.acked,0);
  assert.equal(journal.status().pending,2);
  assert.equal(cloud.status().stored,1);
  journal.close();journal=createFileJournal({dir});
  const replay=await syncJournal({journal,transport:cloud});
  assert.equal(replay.status,"SYNC_OK");
  assert.equal(replay.duplicates,1);
  assert.equal(replay.uploaded,1);
  assert.equal(replay.acked,2);
  assert.equal(journal.status().pending,0);
  journal.close();
  edge=createEdgeRuntime({dir,identity,...portsConfig,sessionId:"boot-B"});
  const newBoot=await edge.sample(1);
  assert.notEqual(newBoot.event.eventId,first.event.eventId);
  assert.notEqual(newBoot.event.eventId,second.event.eventId);
  edge.close();
  journal=createFileJournal({dir});
  assert.equal((await syncJournal({journal,transport:cloud})).acked,1);
  assert.equal(cloud.status().stored,3);
  journal.close();
}));
test("forged remote ACK never updates local cursor; valid retry persists",()=>sandbox(async dir=>{
  const edge=createEdgeRuntime({dir,identity,...ports(),sessionId:"epoch-Z"});
  await edge.sample(1);edge.close();
  const journal=createFileJournal({dir});
  const cloud=createLabCloudReplica({siteId:identity.siteId,deviceId:identity.deviceId});
  cloud.forgeNextAck();
  const forged=await syncJournal({journal,transport:cloud});
  assert.equal(forged.error,"INVALID_REMOTE_ACK");
  assert.equal(journal.status().pending,1);
  const retried=await syncJournal({journal,transport:cloud});
  assert.equal(retried.status,"SYNC_OK");
  assert.equal(retried.duplicates,1);
  assert.equal(journal.status().pending,0);
  journal.close();
}));
test("payload conflicts and scope misuse rejected by mock cloud",()=>sandbox(async dir=>{
  const edge=createEdgeRuntime({dir,identity,...ports(),sessionId:"epoch-Y"});
  await edge.sample(1);edge.close();
  const j=createFileJournal({dir}),original=j.pending()[0];
  const cloud=createLabCloudReplica({siteId:identity.siteId,deviceId:identity.deviceId});
  assert.equal((await cloud.ingest(original)).durable,true);
  const changed={...original,payload:{...original.payload,connectivity:"CONNECTED"}};
  changed.sha256=eventChecksum(changed);
  assert.equal((await cloud.ingest(changed)).error,"EVENT_ID_CONFLICT");
  const wrongScope=createLabCloudReplica({siteId:"other-site",deviceId:identity.deviceId});
  assert.equal((await wrongScope.ingest(original)).error,"DEVICE_SCOPE_MISMATCH");
  const wrongEpoch={...original,payload:{...original.payload,sessionId:"different-epoch"}};
  wrongEpoch.sha256=eventChecksum(wrongEpoch);
  assert.equal((await cloud.ingest(wrongEpoch)).error,"EVENT_ID_SCOPE_MISMATCH");
  assert.equal(j.status().pending,1);
  j.close();
}));
test("revision mismatch preserves pending events across restart",()=>sandbox(async dir=>{
  const edge=createEdgeRuntime({dir,identity,...ports(),sessionId:"epoch-R"});
  await edge.sample(1);edge.close();
  let j=createFileJournal({dir});
  const cloud=createLabCloudReplica({siteId:identity.siteId,deviceId:identity.deviceId,
    allowedRevisions:["cfg-2"]});
  const r=await syncJournal({journal:j,transport:cloud});
  assert.equal(r.error,"CONFIG_REVISION_CONFLICT");
  assert.equal(j.status().pending,1);
  j.close();j=createFileJournal({dir});
  assert.equal(j.status().pending,1);j.close();
}));
test("sync batch bounded and cloud mock does not advertise authenticated",()=>sandbox(async dir=>{
  const {wan,...config}=ports();
  const edge=createEdgeRuntime({dir,identity,...config,sessionId:"epoch-B"});
  await edge.sample(1);
  wan.primary.upstream=false;await edge.sample(1);
  edge.close();
  const j=createFileJournal({dir});
  const cloud=createLabCloudReplica({siteId:identity.siteId,deviceId:identity.deviceId});
  await assert.rejects(()=>syncJournal({journal:j,transport:cloud,maxEvents:0}),/INVALID_SYNC_BOUND/);
  const r=await syncJournal({journal:j,transport:cloud,maxEvents:1});
  assert.equal(r.attempted,1);assert.equal(r.remaining,1);
  assert.equal(cloud.status().authenticated,false);assert.equal(r.deviceValidated,false);
  j.close();
}));
