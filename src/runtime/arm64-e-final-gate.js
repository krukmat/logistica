"use strict";
// E5: bounded-inference virtual research gate, never device or purchase authorization.
const topology=require("../../docs/contracts/pef-r28s-e4-topology-v1.json");
const profiles=require("../../docs/contracts/arm64-vm-profiles-v1.json").profiles;
function evaluate({profile="r28s-1g",d4,e1,e2Small,e2Large}={}){
 if(!profiles[profile])throw Error("E5_INVALID_PROFILE");
 const checks=[],add=(id,pass,detail)=>checks.push({id,pass:Boolean(pass),detail});
 add("E5_D4_CORE_1GB",d4?.kind==="PEF_ARM64_VIRTUAL_FIT_COMPARISON_V1"&&
    d4.ok===true&&d4.profile===profile&&d4.checks?.length===7&&d4.checks.every(c=>c.pass===true)&&
    d4.limits?.procurementApproved===false,{source:"operator imported D4",deviceAttested:false});
 add("E5_E1_FULL_GUEST_PROBE",e1?.kind==="PEF_E1_GUEST_RESOURCE_ENVELOPE_V1"&&
    e1.ok===true&&e1.profile===profile&&e1.guest?.profileEnforced===true&&
    e1.probe?.provisionalMemoryHeadroomOk===true&&e1.probe?.anyOomKilled===false,
    {minAvailableMiB:e1?.probe?.minAvailableMiB??null,
     fullWorkloadIsolationTested:false});
 const e2ok=(r,k)=>r?.kind==="PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1"&&
    r.ok===true&&r.profile===profile&&r.measured?.payloadKiB===k&&
    r.measured?.acked===r.measured?.recovered&&r.model?.eventCount===518400&&
    r.decisions?.seventyTwoHourOfflineAcceptance===false&&r.limits?.physicalValidated===false;
 add("E5_E2_1K_STORAGE",e2ok(e2Small,1),
  {sampled:e2Small?.measured?.acked??0,projectedGiB:e2Small?.model?.estimatedJournalGiB??null});
 add("E5_E2_4K_STORAGE",e2ok(e2Large,4),
  {sampled:e2Large?.measured?.acked??0,projectedGiB:e2Large?.model?.estimatedJournalGiB??null});
 add("E5_E3_CHUNKED_JOURNAL_REOPEN",e2Small?.measured?.reopenReadMode==="STREAMING_64K"&&
    e2Large?.measured?.reopenReadMode==="STREAMING_64K",
    {streamingParser:true,indexMemoryStillLinear:true});
 add("E5_E4_COST_FIRST_TOPOLOGY",topology.decision==="CORE_BEHIND_EXISTING_ROUTER"&&
    topology.nativeEthernetPorts===2&&topology.procurementApproved===false,
    {decision:topology.decision,physicalDualWanPlusLan:false});
 const all=checks.every(x=>x.pass);
 return {kind:"PEF_W1_10_E5_VIRTUAL_HARDWARE_GATE_V1",schemaVersion:1,ok:all,
  status:all?"CORE_ONLY_1GB_VIRTUAL_RESEARCH_COMPLETE":"REQUIRED_VM_EVIDENCE_MISSING",
  profile,checks,
  verdict:all?"R28S_1GB_CORE_ONLY_FURTHER_EVALUATION":"BOARD_CANDIDATE_BLOCKED_PENDING_DATA",
  limitations:{kernelFullSustainedWorkloadTested:false,realCortexA53Benchmark:false,
   retainedJournalMapMemoryFor518400EventsVerified:false,
   seventyTwoHoursOfflineValidated:false,sdCardEndurance:false,
   realWAN_NICValidated:false,actualDeliveredCostKnown:false,
   procurementApproved:false,physicalValidated:false,deviceBackend:"BACKEND_NOT_IMPLEMENTED"},
  nextPhysicalGate:"Obtain vendor single-unit BOM and validate on purchased hardware only after user decision",
  evidenceSource:"OPERATOR_SUPPLIED_UNAUTHENTICATED_GUEST_JSON"};
}
module.exports={evaluate};
