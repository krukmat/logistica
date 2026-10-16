"use strict";
// D4: compare imported guest evidence against the PINNED shared-Core baseline.
// Reports are operator-provided, NOT authenticated hardware attestations.
const {createHash}=require("node:crypto");
const fixture=require("../../docs/contracts/golden-traces-v1.json");
const profiles=require("../../docs/contracts/arm64-vm-profiles-v1.json").profiles;
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const pinned=hash(fixture.scenarios);
function compareArm64Evidence({profile="r28s-1g",core,network,recovery,load}={}){
 if(!profiles[profile])throw Error("D4_UNKNOWN_PROFILE");
 const spec=profiles[profile],checks=[];
 const check=(id,pass,detail)=>checks.push({id,pass:Boolean(pass),detail});
 const coreIdentity=core?.kind==="PEF_ARM64_VM_LAB_REPORT_V1"&&core.guest?.profile===profile;
 const constrained=coreIdentity&&core.guest.profileEnforced===true&&
   core.guest.observed?.arch==="arm64"&&core.guest.observed?.platform==="linux";
 check("D4_PROFILE_ACTUALLY_CONSTRAINED",constrained,{nominalMiB:spec.memoryMiB,
   observedMiB:core?.guest?.observed?.memoryMiB??null});
 check("D4_GOLDEN_TRACE_PINNED",coreIdentity&&core.golden?.ok===true&&
   core.golden?.scenarioCount===4&&core.golden?.baselineSha256===pinned&&
   core.golden?.canonicalSha256===pinned,{pinned});
 check("D4_D2_FSYNC_REOPEN",coreIdentity&&core.ok===true&&core.resource?.accepted>0&&
   core.resource?.accepted===core.resource?.recovered&&core.resource?.error===null,null);
 check("D4_D2_PROCESS_MEMORY",coreIdentity&&core.resource?.processWithinHalfGuestRam===true,
   {peakProcessMiB:core?.resource?.sampledProcessPeakRssMiB??null,
     doesNotMeasureWholeGuest:true});
 const net=network?.kind==="PEF_ARM64_VM_NETNS_CORE"&&network.status==="VM_NETNS_LAB_PASS"&&
   network.ok===true&&network.physicalValidated===false&&network.hostRoutesChanged===false&&
   JSON.stringify(network.steps?.map(s=>s.selectedWan))===JSON.stringify(["primary","backup",null,"primary"]);
 check("D4_VIRTUAL_WAN_TRACE",net,{virtualInterfaces:network?.virtualInterfaces??null,
   physicalPorts:2});
 const forced=recovery?.kind==="PEF_ARM64_D3_RECOVERY_V1"&&recovery.ok===true&&
   recovery.status==="VM_FORCED_STOP_RECOVERY_OPERATOR_REPORTED"&&
   recovery.evidenceOrigin==="LIMA_FORCE_STOP_HOST_CLI_SELF_REPORTED"&&
   recovery.retained===recovery.expected&&recovery.expected===120&&
   recovery.duplicateDetected===true&&recovery.conflictBlocked===true&&
   recovery.writerStillLive===false&&recovery.physicalValidated===false;
 check("D4_D3_FORCED_VM_STOP_RECOVERY",forced,{
   evidenceOrigin:recovery?.evidenceOrigin||"MISSING",selfReportedNotIndependent:true});
 const loaded=load?.kind==="PEF_ARM64_VM_LAB_REPORT_V1"&&load.ok===true&&
   load.guest?.profile===profile&&load.guest?.profileEnforced===true&&
   load.resource?.accepted>=1000&&load.resource.accepted===load.resource.recovered&&
   load.resource.processWithinHalfGuestRam===true;
 check("D4_BOUNDED_LOAD_1G",loaded,{events:load?.resource?.accepted??0,
   throughputPerSecond:load?.resource?.receiptPerSecond??null,
   fullGuestMemoryNotMeasured:true,offline72hNotProven:true});
 const ok=checks.every(c=>c.pass);
 return {kind:"PEF_ARM64_VIRTUAL_FIT_COMPARISON_V1",schemaVersion:1,ok,
   status:ok?"VM_CORE_RESEARCH_CONTINUE":"VM_FIT_EVIDENCE_INCOMPLETE",
   profile,checks,
   verdict:ok?"R28S_1GB_CORE_ONLY_PROMISING":"HARDWARE_DECISION_BLOCKED",
   limits:{realBoardTested:false,fullGuestMemoryMeasured:false,
     physicalTwoWanPlusLanProven:false,offline72hValidated:false,
     vmForceStopIndependentlyAttested:false,physicalPowercutValidated:false,
     procurementApproved:false,deviceBackend:"BACKEND_NOT_IMPLEMENTED"}};
}
module.exports={compareArm64Evidence};
