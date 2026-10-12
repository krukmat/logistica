"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createLoopbackLab,probe,runLoopbackSuite}=require("../src/emulator/lab/loopback.js");
test("loopback 204, 503, timeout and TCP reset are real localhost probes",async()=>{
  const lab=await createLoopbackLab({timeoutMs:60});
  try{
    assert.equal(lab.urls.primary.startsWith("http://127.0.0.1:"),true);
    const status=await probe(lab.urls.primary,60);
    assert.deepEqual(status,{healthy:true,code:"HEALTHY"});
    lab.setFault("primary","http_503");
    assert.equal((await probe(lab.urls.primary,60)).code,"HTTP_503");
    lab.setFault("primary","blackhole");
    assert.equal((await probe(lab.urls.primary,60)).code,"TIMEOUT");
    lab.setFault("primary","reset");
    assert.equal((await probe(lab.urls.primary,60)).healthy,false);
    assert.throws(()=>lab.setFault("primary","other"),/INVALID_FAULT_MODE/);
    assert.throws(()=>probe("http://example.com/health",60),/UNSAFE_PROBE_URL/);
  }finally{await lab.close();}
});
test("loopback-to-PEF logical reconcile preserves LOCAL_ONLY and backlog",async()=>{
  const lab=await createLoopbackLab({timeoutMs:50});
  try{
    assert.equal((await lab.sample()).status.selectedWan,"primary");
    lab.setFault("primary","http_503");
    assert.equal((await lab.sample()).status.selectedWan,"backup");
    lab.setFault("backup","blackhole");
    const offline=await lab.sample();
    assert.equal(offline.status.connectivity,"LOCAL_ONLY");
    assert.equal(offline.status.health,"HEALTHY");
    assert.equal(lab.act("append",{eventId:"offline",payload:{ok:1}}).ack,true);
    assert.equal(lab.act("sync").error,"CLOUD_UNAVAILABLE");
    lab.setFault("primary","healthy");
    assert.equal((await lab.sample()).status.selectedWan,"primary");
    assert.equal(lab.act("sync").uploaded,1);
  }finally{await lab.close();}
});
test("full loopback scenario reports LAB_PASS with no physical claims",async()=>{
  const result=await runLoopbackSuite();
  assert.equal(result.status,"LAB_PASS",JSON.stringify(result.failures));
  assert.equal(result.hardwareValidated,false);
  assert.equal(result.physicalWanValidated,false);
  assert.equal(result.p1DurabilityValidated,false);
  assert.equal(result.steps.length>=6,true);
});
