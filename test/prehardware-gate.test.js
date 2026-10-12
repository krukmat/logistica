"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluatePreHardwareGate,HARDWARE_BLOCKERS,REQUIRED}=require("../src/runtime/handoff-gate.js");
const fixture=()=>({
  emulatorResult:"success",linuxResult:"success",filesPresent:true,
  policyEvidence:{status:"LAB_PASS",hardwareValidated:false,
    assertions:REQUIRED.map(id=>({id,ok:true}))},
  supervisedEvidence:{status:"LAB_PASS",hardwareValidated:false,
    offlineFsync:true,oomKill:1,
    checks:["SUPERVISOR_START","CPU_THROTTLED","RESTART_AFTER_OOM","STOP_AND_RELEASE"]}
});
test("T5 handoff gate permits only starting physical integration, never claims device ready",()=>{
  const output=evaluatePreHardwareGate(fixture());
  assert.equal(output.status,"SOFTWARE_LAB_READY");
  assert.equal(output.verdict,"GO_FOR_DEVICE_INTEGRATION_ONLY");
  assert.equal(output.physical.status,"NOT_RUN");
  assert.equal(output.physical.hardwareValidated,false);
  assert.equal(output.physical.goLiveApproved,false);
  assert.deepEqual(output.physical.blockers,HARDWARE_BLOCKERS);
});
test("T5 fail closed on any absent job, missing Linux E2E, missing fsync or no kernel OOM",()=>{
  const cases=[
    {linuxResult:"failure"},
    {emulatorResult:"failure"},
    {filesPresent:false},
    {policyEvidence:{status:"LAB_PASS",hardwareValidated:false,assertions:[]}},
    {supervisedEvidence:{...fixture().supervisedEvidence,oomKill:0}},
    {supervisedEvidence:{...fixture().supervisedEvidence,offlineFsync:false}}
  ];
  for(const patch of cases){
    const output=evaluatePreHardwareGate({...fixture(),...patch});
    assert.equal(output.status,"BLOCKED",JSON.stringify(patch));
    assert.equal(output.verdict,"NO_GO");
    assert.equal(output.physical.goLiveApproved,false);
  }
});
