"use strict";
const {evaluateShortlist,evaluatePhysicalAcceptance}=require("./hardware-screening.js");
const {observeHost}=require("./device-observation.js");
function runCandidateScreening({tmpParent,samples=8}={}){
 const shortlist=evaluateShortlist(),observation=observeHost({tmpParent,samples});
 const physical=evaluatePhysicalAcceptance();
 const success=shortlist.ok&&observation.status==="LAB_PASS"&&
   physical.status==="NOT_RUN"&&shortlist.candidates.every(c=>c.cost.totalCost===null);
 return {kind:"PEF_C2_HARDWARE_SCREENING_REPORT_V1",
   status:success?"LAB_PASS_PHYSICAL_BLOCKED":"LAB_FAIL",
   ok:success,shortlist,observation,physical,
   recommendedFirstPhysicalProbe:"hp-t620-4gb-refurb",
   recommendationStatus:"PROVISIONAL_NO_PROCUREMENT_APPROVAL",
   approval:"NO_DEVICE_GO",hardwareAcquired:false,hostRoutesChanged:false,
   physicalValidated:false};
}
module.exports={runCandidateScreening};
