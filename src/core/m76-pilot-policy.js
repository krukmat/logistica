"use strict";
// Hard gate: software lab acceptance is not field-pilot / hardware approval.
const EXPECTED=["DEVICE_IDENTITY","SIGNED_RELEASE","LOCAL_MTLS","RECOVERY_AUDIT",
  "SHORT_SOAK","TWO_HOUR_ENDURANCE","PHYSICAL_WAN_NIC",
  "POWER_CUT_STORAGE","ENERGY_THERMALS","OPERATOR_ROLLOUT"];
function decideM76Readiness(evidence){
 if(!evidence||typeof evidence!=="object"||Object.keys(evidence).length!==EXPECTED.length||
    EXPECTED.some(k=>typeof evidence[k]!=="boolean"))
  throw Error("M76_GATE_INPUT_INVALID");
 const labKeys=EXPECTED.slice(0,5);
 const labReady=labKeys.every(k=>evidence[k]===true);
 const fieldReady=EXPECTED.every(k=>evidence[k]===true);
 const blockers=EXPECTED.filter(k=>evidence[k]!==true);
 return {kind:"PEF_M76_PILOT_READINESS_GATE_V1",labReady,
  fieldPilotAuthorized:fieldReady,decision:fieldReady?"GO_FIELD_PILOT":
    labReady?"GO_SOFTWARE_LAB_ONLY":"NO_GO_LAB",
  blockers,physicalValidated:fieldReady&&evidence.PHYSICAL_WAN_NIC&&
    evidence.POWER_CUT_STORAGE&&evidence.ENERGY_THERMALS};
}
module.exports={decideM76Readiness,EXPECTED};
