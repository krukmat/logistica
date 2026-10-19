"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runM63EdgeSyncSmoke}=require("../src/runtime/m63-edge-cloud-lite-smoke.js");
const {createAutonomousEdgeHost}=require("../src/runtime/autonomous-edge.js");
test("M6.3 rejects transport without required ACK proof verification port",()=>{
 assert.throws(()=>createAutonomousEdgeHost({cloudTransport:{ingest:async()=>({})}}),
   /CLOUD_LITE_AUTHENTICATED_TRANSPORT_REQUIRED/);
});
test("M6.3 Edge → real local Cloud Lite: both profiles, offline fsync, HMAC ACK, lost-ACK replay and restart",async()=>{
 const result=await runM63EdgeSyncSmoke();
 assert.equal(result.status,"LAB_PASS",JSON.stringify(result));
 assert.equal(Object.values(result.checks).every(Boolean),true);
 assert.equal(result.cloudMockReplacedInThisTest,true);
 assert.equal(result.remoteTlsValidated,false);
});
