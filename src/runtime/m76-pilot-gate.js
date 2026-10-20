"use strict";
const {runM71IdentitySmoke}=require("./m71-identity-smoke.js");
const {runM72SignedReleaseSmoke}=require("./m72-signed-release-smoke.js");
const {runM73MtlsSmoke}=require("./m73-mtls-smoke.js");
const {runM74OperationalSmoke}=require("./m74-operational-smoke.js");
const {runM75ShortSoak}=require("./m75-endurance.js");
const {decideM76Readiness}=require("../core/m76-pilot-policy.js");
const {inspectM75OperatorEvidence}=require("./m76-evidence-import.js");
async function runM76PilotGate({operatorEvidence=null}={}){
 // Real code paths and evidence. Never infer physical proofs from VM/CI.
 const [device,release,tls,ops,stress]=await Promise.all([
  runM71IdentitySmoke(),runM72SignedReleaseSmoke(),runM73MtlsSmoke(),
  runM74OperationalSmoke(),runM75ShortSoak({cycles:2})]);
 const evidence={
  DEVICE_IDENTITY:device.ok===true&&device.privateKeyInEvidence===false,
  SIGNED_RELEASE:release.ok===true&&release.checks?.SIGNED_HEALTH_FAILED_ROLLBACK===true,
  LOCAL_MTLS:tls.ok===true&&tls.checks?.MUTUAL_CERT_REQUIRED===true,
  RECOVERY_AUDIT:ops.ok===true&&ops.checks?.HASH_CHAIN_TAMPER_BLOCKED===true,
  SHORT_SOAK:stress.ok===true&&stress.completedCycles===2,
  TWO_HOUR_ENDURANCE:false,PHYSICAL_WAN_NIC:false,
  POWER_CUT_STORAGE:false,ENERGY_THERMALS:false,OPERATOR_ROLLOUT:false};
 const operatorEvidenceInspection=inspectM75OperatorEvidence(operatorEvidence);
 // Periodic operator evidence never satisfies the sustained/physical endurance hard gate.
 const decision=decideM76Readiness(evidence);
 return {...decision,ok:decision.labReady&&!decision.fieldPilotAuthorized,
  status:decision.labReady?"LAB_PASS_GATE_ONLY":"LAB_FAIL",
  softwareEvidenceKinds:[device.kind,release.kind,tls.kind,ops.kind,stress.kind],
  version:"M7_SOFTWARE_PREPILOT",
  operatorEvidenceInspection,
  periodicTwoHourOperatorEvidenceAccepted:operatorEvidenceInspection.accepted,
  sustainedEnduranceValidated:false,
  bom:{hardwareUnitCostEuro:null,energyConsumptionW:null,
    hostingAdditionalEuro:0,notes:"Hardware costs and physical BOM deliberately not estimated/validated"},
  operationalScope:"LOCAL_MAC_OR_CI_ONLY",
  physicalPowerCutValidated:false,remoteTlsValidated:false,
  certificateRevocationValidated:false,
  longRun24HoursValidated:false,platform:process.platform,arch:process.arch};
}
module.exports={runM76PilotGate};
