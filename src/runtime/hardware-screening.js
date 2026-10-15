"use strict";
// C2 independent product-cost comparison; quoted board price is not a finished BOM.
const inventory=require("../../docs/contracts/hardware-shortlist-v1.json");
const finiteMoney=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
function evaluateCandidate(candidate){
 if(!candidate||typeof candidate.id!=="string"||!candidate.specs||
    !Array.isArray(candidate.billOfMaterials)||!candidate.priceReference)
   throw Error("C2_INVALID_CANDIDATE");
 const items=candidate.billOfMaterials;
 if(!items.length||items.some(x=>typeof x.component!=="string"||typeof x.required!=="boolean"||
   typeof x.currency!=="string"||x.price!==null&&!finiteMoney(x.price)))
   throw Error("C2_INVALID_BOM");
 const currency=candidate.priceReference.currency;
 if(items.some(x=>x.currency!==currency))throw Error("C2_MIXED_CURRENCY_BOM");
 const required=items.filter(x=>x.required);
 const missing=required.filter(x=>x.price===null).map(x=>x.component);
 const known=required.filter(x=>x.price!==null);
 const subtotal=Math.round((known.reduce((s,x)=>s+x.price,0)+Number.EPSILON)*100)/100;
 const {ramMiB,ethernetNative,bootStorage}=candidate.specs;
 const min=inventory.thresholds;
 const screening={
   ram:ramMiB>=min.minRamMiB?"DOCUMENTED_FIT":"DOCUMENTED_BELOW_MIN",
   network:ethernetNative>=min.minTotalEthernetPorts?"NATIVE_FIT":"REQUIRES_ADAPTER_OR_EXTERNAL_ROUTER",
   storage:bootStorage?.included===true&&bootStorage.capacityGiB>=min.minBootStorageGiB?
     "NOMINAL_CAPACITY_ONLY":"STORAGE_PROVISIONING_REQUIRED"};
 return {id:candidate.id,name:candidate.name,role:candidate.role,
   screening,qualifiesForFirstDeviceInvestigation:Object.values(screening).every(x=>
     x==="DOCUMENTED_FIT"||x==="NATIVE_FIT"||x==="NOMINAL_CAPACITY_ONLY"),
   cost:{currency,knownSubtotal:subtotal,unknownRequiredComponents:missing,
     totalCost:null,complete:false,taxAndShippingVerified:false},
   sources:[candidate.priceReference.source],questions:candidate.openQuestions,
   evidence:"VENDOR_SPECIFICATION_AND_PRICE_SNAPSHOT_ONLY",hardwareValidated:false};
}
function evaluateShortlist({candidates=inventory.candidates}={}){
 if(!Array.isArray(candidates)||candidates.length!==3||
   new Set(candidates.map(x=>x.id)).size!==3)throw Error("C2_CANDIDATE_SET_INVALID");
 const results=candidates.map(evaluateCandidate);
 const suggested=results.filter(x=>x.qualifiesForFirstDeviceInvestigation).map(x=>x.id);
 return {kind:"PEF_HARDWARE_SHORTLIST_ASSESSMENT_V1",status:"SCREENING_COMPLETE_PHYSICAL_NOT_RUN",
   ok:true,shortlistDate:inventory.date,criteria:inventory.thresholds,candidates:results,
   firstInvestigationCandidates:suggested,
   physicallyMeasured:false,deviceBackend:"BACKEND_NOT_IMPLEMENTED",
   procurementApproved:false,fieldDeploymentApproved:false};
}
function evaluatePhysicalAcceptance(evidence={}){
 if(evidence===null||typeof evidence!=="object"||Array.isArray(evidence))throw Error("C2_INVALID_EVIDENCE");
 return {kind:"PEF_C2_PHYSICAL_ACCEPTANCE_V1",status:"NOT_RUN",
   required:inventory.hardAcceptance.required.map(id=>({id,verified:false,
     state:"NOT_RUN",selfReported:Boolean(evidence[id])})),
   physicalValidated:false,deviceBackend:"BACKEND_NOT_IMPLEMENTED",
   canEnableDevice:false,reason:"INDEPENDENT_PHYSICAL_EVIDENCE_PIPELINE_NOT_INSTALLED"};
}
module.exports={evaluateCandidate,evaluateShortlist,evaluatePhysicalAcceptance};
