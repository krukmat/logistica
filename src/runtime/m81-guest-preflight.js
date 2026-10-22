"use strict";
// M8.1.A read-only static inspection, with optional UNATTESTED guest observations.
const {makeLinuxIsolationPlan}=require("../adapters/linux-workload-isolation.js");
const {propertyManifest,hostManifest}=require("./demo-workload.js");
const {runM54ServiceContract}=require("./m5-systemd-unit.js");
const {assessM81GuestContract}=require("../core/m81-guest-contract.js");
function runM81GuestPreflight({guestReport=null}={}){
 const propertyPlan=makeLinuxIsolationPlan(propertyManifest());
 const hostPlan=makeLinuxIsolationPlan(hostManifest());
 return assessM81GuestContract({guestReport,
  releaseContractOk:runM54ServiceContract().ok,
  propertyPlan,hostPlan,isolatedDriverGuestSupported:false});
}
module.exports={runM81GuestPreflight};
