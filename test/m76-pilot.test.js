"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {EXPECTED,decideM76Readiness}=require("../src/core/m76-pilot-policy.js");
const {runM76PilotGate}=require("../src/runtime/m76-pilot-gate.js");
test("M7.6 must not greenlight field pilot without long run, NIC, powercut and energy",()=>{
 const all=Object.fromEntries(EXPECTED.map(x=>[x,true]));
 assert.equal(decideM76Readiness({...all,POWER_CUT_STORAGE:false}).fieldPilotAuthorized,false);
 assert.equal(decideM76Readiness({...all,TWO_HOUR_ENDURANCE:false}).decision,"GO_SOFTWARE_LAB_ONLY");
 assert.throws(()=>decideM76Readiness({}),/M76_GATE_INPUT_INVALID/);
});
test("M7.6 actual security+recovery+short endurance closes software lab only",async()=>{
 const result=await runM76PilotGate();
 assert.equal(result.status,"LAB_PASS_GATE_ONLY",JSON.stringify(result));
 assert.equal(result.decision,"GO_SOFTWARE_LAB_ONLY");
 assert.equal(result.fieldPilotAuthorized,false);
 assert.equal(result.blockers.includes("POWER_CUT_STORAGE"),true);
});
