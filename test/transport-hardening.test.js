"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {randomBytes}=require("node:crypto");
const {openLabBoot}=require("../src/emulator/lab/lab-bootstrap.js");
const {signLabAck,verifyLabAck,ackBytes}=require("../src/emulator/lab/transport-frame.js");
const {createLabCloudReplica,syncJournal}=require("../src/emulator/lab/cloud-replay.js");
const {createEdgeRuntime}=require("../src/emulator/lab/edge-runtime.js");
const identity={siteId:"lab-site",deviceId:"lab-device",configRevision:"cfg-1"};
async function fixture(callback){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-trust-test-"));
  try{return await callback(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test("P1 bootstrap persists non-secret identity across process epochs, refusing corruption and scope mismatch",()=>fixture(dir=>{
  const one=openLabBoot({dir,identity}),two=openLabBoot({dir,identity});
  assert.equal(one.metadataFsync,true);
  assert.equal(two.created,false);
  assert.notEqual(one.sessionId,two.sessionId);
  assert.equal(two.identity.deviceId,identity.deviceId);
  const file=path.join(dir,"pef-lab-identity.json");
  assert.equal(fs.statSync(file).mode&0o077,0);
  assert.throws(()=>openLabBoot({dir,identity:{...identity,deviceId:"other-device"}}),/LAB_BOOT_IDENTITY_CONFLICT/);
  fs.writeFileSync(file,"corrupted",{"encoding":"utf8"});
  assert.throws(()=>openLabBoot({dir,identity}),/LAB_BOOT_CORRUPT/);
}));
test("P2 canonical ACK frame uses fixed tuple ordering, proof rejects changed scope or missing signature",()=>{
  const key=randomBytes(32);
  const ack={protocolVersion:1,eventId:"wan.lab-device.epoch.1",
    sha256:"a".repeat(64),siteId:"lab-site",deviceId:"lab-device",duplicate:false};
  const signed={...ack,labProof:signLabAck(ack,key)};
  assert.equal(verifyLabAck(signed,key),true);
  assert.deepEqual(ackBytes({...ack,sha256:ack.sha256}),ackBytes(ack));
  assert.equal(verifyLabAck({...signed,siteId:"different-site"},key),false);
  assert.equal(verifyLabAck({...signed,protocolVersion:2},key),false);
  assert.equal(verifyLabAck({...signed,labProof:undefined},key),false);
  assert.equal(verifyLabAck(signed,randomBytes(32)),false);
});
test("P2 timeout budget is bounded and a delayed mock commit is replayed by event ID",()=>fixture(async dir=>{
  const key=randomBytes(32);
  const edge=createEdgeRuntime({dir,identity,sessionId:"test-epoch",
    probe:async()=>({link:true,upstream:true}),applyRoute:async()=>{}});
  await edge.sample(1);
  const cloud=createLabCloudReplica({siteId:identity.siteId,deviceId:identity.deviceId,
    proofKey:key,allowedRevisions:[identity.configRevision]});
  cloud.stallNextIngest();
  const incomplete=await edge.sync(cloud,4,{timeoutMs:40,maxAttempts:1});
  assert.equal(incomplete.error,"REMOTE_TIMEOUT");
  assert.equal(incomplete.acked,0);
  assert.equal(edge.status().storage.pending,1);
  assert.equal(cloud.status().stored,1);
  const result=await edge.sync(cloud,4,{timeoutMs:40,maxAttempts:2});
  assert.equal(result.status,"SYNC_OK");
  assert.equal(result.duplicates,1);
  assert.equal(edge.status().storage.pending,0);
  await assert.rejects(()=>edge.sync(cloud,4,{timeoutMs:0}),/INVALID_SYNC_TIMEOUT/);
  await assert.rejects(()=>edge.sync(cloud,4,{maxAttempts:4}),/INVALID_RETRY_BOUND/);
  edge.close();
}));
