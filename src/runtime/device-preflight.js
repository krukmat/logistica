"use strict";
// Planning diagnostics only: caller-supplied claims cannot certify physical device readiness.
const contract=require("../../docs/contracts/device-integration-v1.json");
const {openRuntimeBackend}=require("./backend-registry.js");
function inspectDeviceDriverShape(candidate){
 const ports=contract.driverPorts;
 const missing=[];
 for(const [group,detail] of Object.entries(ports))
   for(const method of detail.required)
     if(typeof candidate?.[group]?.[method]!=="function")missing.push(group+"."+method);
 return {ok:missing.length===0,missing,contractVersion:contract.schemaVersion,
   driverValidated:false,physicalValidated:false,deviceAuthorized:false};
}
function assessDeviceReadiness({claims={}}={}){
 if(!claims||Array.isArray(claims)||typeof claims!=="object"||
    Object.keys(claims).some(id=>!contract.requirements.some(r=>r.id===id))||
    Object.values(claims).some(v=>!["NOT_RUN","LAB_PASS","DEVICE_PASS"].includes(v)))
   throw Error("C1_INVALID_EVIDENCE_CLAIMS");
 // DEVICE_PASS remains a *claim* here, never trusted evidence or driver authorization.
 const pending=contract.requirements.map(r=>({id:r.id,claimed:claims[r.id]||"NOT_RUN",
   verified:false,requiredEvidence:r.evidence}));
 const backend=openRuntimeBackend("device");
 return {kind:"PEF_DEVICE_PREFLIGHT_V1",status:"DEVICE_BLOCKED",
   planningStatus:"REQUIREMENTS_DEFINED",
   backendError:backend.error,deviceBackendEnabled:backend.ok===true,
   requirements:pending,physicalValidated:false,productionAuthorized:false,
   source:"UNATTESTED_READ_ONLY_PLANNING",next:"INDEPENDENT_DEVICE_EVIDENCE_AND_DRIVER_REQUIRED"};
}
module.exports={inspectDeviceDriverShape,assessDeviceReadiness};
