"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runM74OperationalSmoke}=require("../src/runtime/m74-operational-smoke.js");
test("M7.4 M3 autonomous recovery produces durable hashed, redacted, auth-gated operational audit",async()=>{
 const result=await runM74OperationalSmoke();
 assert.equal(result.status,"LAB_PASS",JSON.stringify(result));
 assert.equal(result.checks.HASH_CHAIN_TAMPER_BLOCKED,true);
 assert.equal(result.checks.UNAUTHORIZED_RECOVERY_DENIED,true);
 assert.equal(result.remoteRecoveryAllowed,false);
});
