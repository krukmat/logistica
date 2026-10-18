"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runM3RecoverySmoke}=require("../src/emulator/lab/m3-recovery-smoke.js");
test("M3.3/4 actual daemon: config stage/activate/commit, negative rollback, safe mode & local recovery",async()=>{
 const result=await runM3RecoverySmoke();
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.status,"LAB_PASS");
 assert.equal(result.revision,2);
 assert.equal(result.safeModeObserved,true);
 assert.equal(result.recoveredLocally,true);
 assert.equal(Object.values(result.checks).every(Boolean),true);
 assert.equal(result.physicalValidated,false);
});
