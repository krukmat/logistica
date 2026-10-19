"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runM64CloudLiteMatrix}=require("../src/runtime/m64-cloud-lite-matrix.js");
test("M6.4 real HTTP Property Host: outage, wrong bearer, forged HMAC, dedup, full Edge reopening",async()=>{
 const r=await runM64CloudLiteMatrix();
 assert.equal(r.status,"LAB_PASS",JSON.stringify(r));
 assert.equal(r.assertions,15);
 assert.equal(Object.values(r.checks).every(Boolean),true);
 for(const name of ["property","host"]){
  assert.equal(Object.values(r.profiles[name]).every(Boolean),true,name);
 }
 assert.equal(r.legacyCloudMockRemoved,false);
 assert.equal(r.realTlsValidated,false);
 assert.equal(r.physicalPowerCutValidated,false);
});
