"use strict";
// Pure CI handoff verdict. Software-lab readiness never certifies a physical device.
const REQUIRED=["standalone-linux-bootstrap","standalone-linux-offline",
  "standalone-linux-fsync","standalone-linux-reopen"];
const HARDWARE_BLOCKERS=Object.freeze([
  "DEVICE_NIC_ROUTING_NAT_DHCP_FIREWALL",
  "DEVICE_PKI_PROVISIONING_MTLS",
  "DEVICE_SERVICE_INSTALL_BOOT_WATCHDOG_OTA",
  "PHYSICAL_STORAGE_POWER_CUT_AND_P2_P3_QUOTAS",
  "PRODUCTION_WORKLOAD_HARDENING_SECCOMP",
  "PHYSICAL_PERFORMANCE_RECOVERY_AND_THERMAL_TESTS"
]);
function evaluatePreHardwareGate({emulatorResult,linuxResult,policyEvidence,
  supervisedEvidence,filesPresent=false}={}){
  const assertions=policyEvidence?.assertions||[];
  const ids=new Set(assertions.filter(x=>x?.ok===true).map(x=>x.id));
  const kernel=supervisedEvidence?.checks||[];
  const linuxE2e=policyEvidence?.status==="LAB_PASS"&&
    policyEvidence.hardwareValidated===false&&
    REQUIRED.every(id=>ids.has(id));
  const processE2e=supervisedEvidence?.status==="LAB_PASS"&&
    supervisedEvidence.hardwareValidated===false&&
    supervisedEvidence.oomKill>=1&&supervisedEvidence.offlineFsync===true&&
    ["SUPERVISOR_START","CPU_THROTTLED","RESTART_AFTER_OOM","STOP_AND_RELEASE",
      "STANDALONE_DAEMON_KERNEL_WORKER","STANDALONE_DAEMON_OFFLINE_FSYNC"].every(x=>kernel.includes(x));
  const ciJobs=emulatorResult==="success"&&linuxResult==="success";
  const passed=Boolean(filesPresent&&ciJobs&&linuxE2e&&processE2e);
  return {kind:"PEF_PRE_HARDWARE_HANDOFF_V1",status:passed?"SOFTWARE_LAB_READY":"BLOCKED",
    verdict:passed?"GO_FOR_DEVICE_INTEGRATION_ONLY":"NO_GO",
    validated:{nodeAndDashboardCi:emulatorResult==="success",
      linuxNamespaceCi:linuxResult==="success",
      standaloneLinuxOfflineAndReopen:linuxE2e,
      supervisedCgroupKernel:processE2e,
      requiredSources:filesPresent},
    physical:{status:"NOT_RUN",hardwareValidated:false,goLiveApproved:false,
      blockers:[...HARDWARE_BLOCKERS]},
    limitations:"CI software/isolated Linux only; not a product, device certification or purchasing approval"};
}
module.exports={evaluatePreHardwareGate,HARDWARE_BLOCKERS,REQUIRED};
