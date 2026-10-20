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

function syntheticPeriodicReport(){
 const start=Date.now()-7200000;
 const samples=Array.from({length:119},(_,i)=>({
  at:start+i*60000,ok:true,peakRssBytes:99000000+i*10000,elapsedMs:750,error:null
 }));
 return {kind:"PEF_M75_OPERATOR_LONG_SOAK_V1",status:"LAB_PASS",ok:true,
  requestedHours:2,elapsedMs:7200025,sampleCount:samples.length,failures:0,
  workload:"REAL_HTTP_CLOUD_LITE_FAILURE_MATRIX",hardwareValidated:false,samples};
}
test("M7.6.A structurally accepts periodic operator evidence but refuses physical authorization",async()=>{
 const {inspectM75OperatorEvidence}=require("../src/runtime/m76-evidence-import.js");
 const fixture=syntheticPeriodicReport(),r=inspectM75OperatorEvidence(fixture);
 assert.equal(r.accepted,true,JSON.stringify(r));
 assert.equal(r.authenticityVerified,false);
 assert.equal(r.continuousLoadValidated,false);
 assert.equal(r.fieldPilotEvidence,false);
 const gate=await runM76PilotGate({operatorEvidence:fixture});
 assert.equal(gate.periodicTwoHourOperatorEvidenceAccepted,true);
 assert.equal(gate.fieldPilotAuthorized,false);
 assert.equal(gate.decision,"GO_SOFTWARE_LAB_ONLY");
 assert.equal(gate.blockers.includes("TWO_HOUR_ENDURANCE"),true);
});
test("M7.6.A rejects missing, tampered, nonperiodic and inconsistent operator reports",()=>{
 const {inspectM75OperatorEvidence}=require("../src/runtime/m76-evidence-import.js");
 assert.equal(inspectM75OperatorEvidence(null).accepted,false);
 const fixture=syntheticPeriodicReport();
 fixture.samples[8].at=fixture.samples[7].at;
 assert.equal(inspectM75OperatorEvidence(fixture).accepted,false);
 fixture.samples[8].at=fixture.samples[7].at+60000;
 fixture.failures=1;
 assert.equal(inspectM75OperatorEvidence(fixture).accepted,false);
 fixture.failures=0;fixture.samples[0].ok=false;
 assert.equal(inspectM75OperatorEvidence(fixture).accepted,false);
 fixture.samples[0].ok=true;fixture.sampleCount=2;
 assert.equal(inspectM75OperatorEvidence(fixture).accepted,false);
});
