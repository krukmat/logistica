"use strict";
// C2: Seeed-only NEW hardware. Quantity, stock, missing kit items and FX prevent a fake POC GO.
const inventory=require("../../docs/contracts/hardware-shortlist-v1.json");
const money=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
function evaluateCandidate(c){
 if(!c||typeof c.id!=="string"||!c.specs||!Array.isArray(c.billOfMaterials)||
   !c.priceReference||!c.commerce)throw Error("C2_INVALID_CANDIDATE");
 if(c.condition!=="NEW"||c.manufacturer!=="Seeed Studio"||
   !c.priceReference.source?.startsWith("https://www.seeedstudio.com/"))
   throw Error("C2_SUPPLIER_NEW_ONLY");
 const currency=c.priceReference.currency,items=c.billOfMaterials;
 if(!items.length||!money(c.priceReference.amount)||!["USD","EUR"].includes(currency)||
    items.some(x=>!x||typeof x.component!=="string"||typeof x.required!=="boolean"||
     x.currency!==currency||x.price!==null&&!money(x.price)))throw Error("C2_MIXED_CURRENCY_BOM");
 const required=items.filter(x=>x.required);
 const missing=required.filter(x=>x.price===null).map(x=>x.component);
 const subtotal=Math.round(required.reduce((sum,x)=>sum+(x.price||0),0)*100)/100;
 const ramOK=c.specs.ramMiB>=inventory.thresholds.minRamMiB,
  netOK=c.specs.ethernetNative>=inventory.thresholds.minTotalEthernetPorts,
  storageOK=c.specs.bootStorage?.included===true&&
     c.specs.bootStorage?.capacityGiB>=inventory.thresholds.minBootStorageGiB;
 const qty=c.commerce.minimumOrderQuantity;
 if(qty!==null&&(!Number.isSafeInteger(qty)||qty<1))throw Error("C2_INVALID_MOQ");
 const oneUnitAvailable=c.commerce.inStock===true&&c.commerce.singleUnitOrderable===true&&
     qty!==null&&qty<=1;
 const sameCurrency=currency===inventory.budget.currency;
 const knownBudgetUnderLimit=sameCurrency?subtotal<=inventory.budget.targetCompletePoCEur:null;
 const bomComplete=missing.length===0;
 const pricedAllIn=oneUnitAvailable&&bomComplete&&sameCurrency&&knownBudgetUnderLimit;
 const screening={
   ram:ramOK?"DOCUMENTED_FIT":"BELOW_PREFERRED_HEADROOM",
   network:netOK?"SINGLE_LAN_PORT_PRESENT":"LAN_ADAPTER_REQUIRED",
   storage:storageOK?"NOMINAL_CAPACITY_ONLY":"STORAGE_PROVISIONING_REQUIRED"};
 return {id:c.id,name:c.name,role:c.role,
   condition:c.condition,manufacturer:c.manufacturer,
   screening,qualifiesForFirstDeviceInvestigation:Boolean(pricedAllIn&&ramOK&&netOK&&storageOK),
   coreOnlyEligibleForProbe:Boolean(pricedAllIn&&ramOK&&netOK&&storageOK),
   fullDualWanGatewayReady:false,
   requiredGatewayEthernetPorts:inventory.thresholds.fullWanPlusLanPortsNeeded,
   commerce:{...c.commerce,oneUnitAvailable,volumePriceNotPrototypePrice:qty!==null&&qty>1},
   cost:{currency,referencePrice:c.priceReference.amount,knownSubtotal:subtotal,
     targetAllInEur:inventory.budget.targetCompletePoCEur,
     knownWithinEuroBudget:knownBudgetUnderLimit,unknownRequiredComponents:missing,
     totalCost:null,complete:false,taxAndShippingVerified:false,budgetApproved:false,
     status:!oneUnitAvailable?"NOT_AVAILABLE_AS_ONE_UNIT":!sameCurrency?
       "FX_AND_EU_LANDED_COST_UNKNOWN":!bomComplete?"BOM_INCOMPLETE":"VERIFY_LANDED_COST"},
   sources:[c.priceReference.source,...(c.extraSource?[c.extraSource]:[])],
   questions:c.openQuestions,evidence:"SEEED_PRODUCT_PAGE_SCREENING_NOT_PURCHASE_OR_DEVICE_TEST",
   hardwareValidated:false};
}
function evaluateShortlist({candidates=inventory.candidates}={}){
 if(!Array.isArray(candidates)||candidates.length!==3||
   new Set(candidates.map(x=>x.id)).size!==3)throw Error("C2_CANDIDATE_SET_INVALID");
 const results=candidates.map(evaluateCandidate);
 const eligible=results.filter(c=>c.qualifiesForFirstDeviceInvestigation).map(c=>c.id);
 return {kind:"PEF_HARDWARE_SHORTLIST_ASSESSMENT_V1",
   status:"SEEED_SINGLE_UNIT_SEARCH_BLOCKED",
   ok:true,shortlistDate:inventory.date,criteria:inventory.thresholds,budget:inventory.budget,
   profiles:inventory.profiles,excludedHighCost:inventory.oldHighCostOptions,
   candidates:results,firstInvestigationCandidates:eligible,
   possibleVolumeLead:"seeed-linkstar-h28k-0408",
   singlePrototypeStatus:eligible.length?"PRICE_VERIFIED":"NO_CONFIRMED_CHEAP_ONE_UNIT_PEF",
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
