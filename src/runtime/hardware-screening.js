"use strict";
// W1.10.C2: cheap-first POC screening, never equate a board price with an all-in BOM.
const inventory=require("../../docs/contracts/hardware-shortlist-v1.json");
const money=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
function evaluateCandidate(candidate){
 if(!candidate||typeof candidate.id!=="string"||!candidate.specs||
    !Array.isArray(candidate.billOfMaterials)||!candidate.priceReference)
   throw Error("C2_INVALID_CANDIDATE");
 const items=candidate.billOfMaterials;
 if(!items.length||items.some(x=>typeof x.component!=="string"||typeof x.required!=="boolean"||
   typeof x.currency!=="string"||x.price!==null&&!money(x.price)))
   throw Error("C2_INVALID_BOM");
 const currency=candidate.priceReference.currency;
 if(currency!=="EUR"||items.some(x=>x.currency!==currency))throw Error("C2_MIXED_CURRENCY_BOM");
 const required=items.filter(x=>x.required);
 const missing=required.filter(x=>x.price===null).map(x=>x.component);
 const known=required.filter(x=>x.price!==null);
 const subtotal=Math.round(known.reduce((s,x)=>s+x.price,0)*100)/100;
 const {ramMiB,ethernetNative,bootStorage}=candidate.specs;
 const min=inventory.thresholds,budget=inventory.budget;
 const screening={
   ram:ramMiB>=min.minRamMiB?"DOCUMENTED_FIT":"BELOW_PREFERRED_HEADROOM",
   network:ethernetNative>=min.minTotalEthernetPorts?"SINGLE_LAN_PORT_PRESENT":"LAN_ADAPTER_REQUIRED",
   storage:bootStorage?.included===true&&bootStorage.capacityGiB>=min.minBootStorageGiB?
     "NOMINAL_CAPACITY_ONLY":"STORAGE_PROVISIONING_REQUIRED"};
 const entryWithinBudget=candidate.priceReference.amount<=budget.maxReferenceDeviceEur&&
   subtotal<=budget.targetCompletePoCEur;
 const firstInvestigationEligible=entryWithinBudget&&
   screening.ram==="DOCUMENTED_FIT"&&
   screening.network==="SINGLE_LAN_PORT_PRESENT"&&
   screening.storage==="NOMINAL_CAPACITY_ONLY";
 return {id:candidate.id,name:candidate.name,role:candidate.role,
   screening,qualifiesForFirstDeviceInvestigation:firstInvestigationEligible,
   coreOnlyEligibleForProbe:firstInvestigationEligible,
   fullDualWanGatewayReady:false,
   requiredGatewayEthernetPorts:min.fullWanPlusLanPortsNeeded,
   cost:{currency,referencePrice:candidate.priceReference.amount,knownSubtotal:subtotal,
     targetAllInEur:budget.targetCompletePoCEur,
     remainingUnallocatedEur:Math.round((budget.targetCompletePoCEur-subtotal)*100)/100,
     entryWithinBudget,unknownRequiredComponents:missing,totalCost:null,complete:false,
     taxAndShippingVerified:false,budgetApproved:false,
     status:missing.length?"INCOMPLETE_PRICE_CANNOT_APPROVE":"VERIFY_LANDED_COST"},
   sources:[candidate.priceReference.source],questions:candidate.openQuestions,
   evidence:"LISTING_AND_SPEC_SCREENING_ONLY",hardwareValidated:false};
}
function evaluateShortlist({candidates=inventory.candidates}={}){
 if(!Array.isArray(candidates)||candidates.length!==3||
   new Set(candidates.map(x=>x.id)).size!==3)throw Error("C2_CANDIDATE_SET_INVALID");
 const results=candidates.map(evaluateCandidate);
 const eligible=results.filter(x=>x.qualifiesForFirstDeviceInvestigation)
   .sort((a,b)=>a.cost.knownSubtotal-b.cost.knownSubtotal).map(x=>x.id);
 return {kind:"PEF_HARDWARE_SHORTLIST_ASSESSMENT_V1",status:"CHEAP_FIRST_SCREENING_PHYSICAL_NOT_RUN",
   ok:true,shortlistDate:inventory.date,criteria:inventory.thresholds,
   budget:inventory.budget,profiles:inventory.profiles,
   excludedHighCost:inventory.oldHighCostOptions,candidates:results,
   firstInvestigationCandidates:eligible,
   physicallyMeasured:false,deviceBackend:"BACKEND_NOT_IMPLEMENTED",
   procurementApproved:false,fieldDeploymentApproved:false};
}
function evaluatePhysicalAcceptance(evidence={}){
 if(!evidence||typeof evidence!=="object"||Array.isArray(evidence))throw Error("C2_INVALID_EVIDENCE");
 return {kind:"PEF_C2_PHYSICAL_ACCEPTANCE_V1",status:"NOT_RUN",
   required:inventory.hardAcceptance.required.map(id=>({id,verified:false,
     state:"NOT_RUN",selfReported:Boolean(evidence[id])})),
   physicalValidated:false,deviceBackend:"BACKEND_NOT_IMPLEMENTED",
   canEnableDevice:false,reason:"INDEPENDENT_PHYSICAL_EVIDENCE_PIPELINE_NOT_INSTALLED"};
}
module.exports={evaluateCandidate,evaluateShortlist,evaluatePhysicalAcceptance};
