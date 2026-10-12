"use strict";
// Kernel isolation plan derived from a validated PEF Workload Manifest.
// Applying a plan requires explicit, GitHub-hosted Linux root lab preflight.
const {validateWorkloadManifest}=require("../core/workload-manager.js");
function makeLinuxIsolationPlan(manifest){
  const valid=validateWorkloadManifest(manifest);
  if(!valid.ok)throw Error(valid.error);
  if(manifest.workload_id!=="pef-receiver")throw Error("WORKLOAD_BINARY_NOT_ALLOWLISTED");
  const {cpu_limit_millicores:mc,memory_limit_mib:mib,storage_limit_mib:storage}=manifest.resources;
  if(mc>1000||mib>1024||storage>512)throw Error("LINUX_LAB_LIMIT_TOO_LARGE");
  const cpuQuota=Math.max(1000,Math.ceil(mc*100)); // 100000 us × millicores / 1000
  return Object.freeze({kind:"PEF_LINUX_CGROUP_V2_PLAN",workloadId:manifest.workload_id,
    cpuMax:cpuQuota+" 100000",memoryMax:String(mib*1048576),
    pidsMax:"16",storageQuotaEnforced:false,
    networkNamespaceRequired:true,chrootRequired:true,dropUid:65534,
    hardwareValidated:false,scope:"GitHub-hosted ephemeral Linux lab only"});
}
function assertHostedLinuxIsolationPreflight(env=process.env){
  if(process.platform!=="linux"||process.getuid?.()!==0||env.CI!=="true"||
    env.GITHUB_ACTIONS!=="true"||env.RUNNER_ENVIRONMENT!=="github-hosted"||
    env.PEF_S3_ACK!=="GITHUB_HOSTED_EPHEMERAL_ONLY")
    throw Error("LAB_BLOCKED:hosted-root-only");
  return true;
}
module.exports={makeLinuxIsolationPlan,assertHostedLinuxIsolationPreflight};
