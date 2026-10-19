"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {nextSecureState}=require("../src/core/m72-signed-update-policy.js");
const {runM72SignedReleaseSmoke}=require("../src/runtime/m72-signed-release-smoke.js");
test("M7.2 signed lifecycle rejects stale authorization and downgrade even if signed",()=>{
 const hash="b".repeat(64),rootId="a".repeat(64);
 const current={sequence:4,ordinal:2,floorOrdinal:4,activeVersion:"v2",activeHash:hash,
  previousVersion:"v1",previousHash:hash,previousReleaseOrdinal:1,previousKnownGood:true};
 const permit={kind:"PEF_M72_SIGNED_ACTIVATION_V1",mode:"upgrade",version:"v3",
  digest:hash,rootId,ordinal:3,sequence:5,previousVersion:"v2",
  previousDigest:hash,previousOrdinal:2,floorOrdinal:4};
 assert.throws(()=>nextSecureState(current,permit,rootId),/M72_DOWNGRADE_DENIED/);
 assert.throws(()=>nextSecureState(current,{...permit,ordinal:5,sequence:4},rootId),
  /M72_SEQUENCE_ROLLBACK_DENIED/);
 assert.throws(()=>nextSecureState(current,{...permit,ordinal:5,previousVersion:"v1"},rootId),
  /M72_STALE_TRANSITION/);
});
test("M7.2 real signed M5 Edge package, fsync, denied forgeries and explicit health rollback",async()=>{
 const r=await runM72SignedReleaseSmoke();
 assert.equal(r.status,"LAB_PASS",JSON.stringify(r));
 assert.equal(Object.values(r.checks).every(Boolean),true);
 assert.equal(r.privateKeyInEvidence,false);
 assert.equal(r.secureBootValidated,false);
});
