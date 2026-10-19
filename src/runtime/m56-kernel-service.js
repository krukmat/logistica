"use strict";
// M5.6 — CI-only root service composition; this is NOT a production deployment path.
// Reject before any filesystem mutation or fallback driver selection.
const fs=require("node:fs"),path=require("node:path");
const {assertHostedLinuxIsolationPreflight}=require("../adapters/linux-workload-isolation.js");
const {createLinuxIsolatedProcessDriver}=require("../adapters/linux-isolated-process-driver.js");
const {validateEdgeConfig}=require("./edge-config.js");
const {createAutonomousEdgeHost}=require("./autonomous-edge.js");
const NAMES=Object.freeze(["--config","--namespace","--cgroup","--rootfs","--node-inside","--host-canary"]);
function parseArgs(args){
 if(!Array.isArray(args)||args.length!==12)throw Error("M56_CLI_ARGS_DENIED");
 const options={};
 for(let i=0;i<args.length;i+=2){
   if(!NAMES.includes(args[i])||Object.hasOwn(options,args[i])||
      typeof args[i+1]!=="string"||!args[i+1])throw Error("M56_CLI_ARGS_DENIED");
   options[args[i]]=args[i+1];
 }
 if(Object.keys(options).length!==6||!NAMES.every(x=>Object.hasOwn(options,x)))
   throw Error("M56_CLI_ARGS_DENIED");
 for(const key of ["--config","--cgroup","--rootfs","--node-inside","--host-canary"]){
   if(!path.isAbsolute(options[key])||options[key].split(path.sep).includes(".."))
     throw Error("M56_ABSOLUTE_PATH_REQUIRED:"+key);
 }
 return options;
}
function assertM56CiScope(env=process.env){
 assertHostedLinuxIsolationPreflight(env);
 if(env.PEF_M56_ACK!=="GITHUB_HOSTED_EPHEMERAL_SERVICE_ONLY"||
    fs.readFileSync("/proc/1/comm","utf8").trim()!=="systemd")
   throw Error("M56_SERVICE_LAB_BLOCKED");
 return true;
}
async function startM56CiService(args,{env=process.env}={}){
 assertM56CiScope(env);
 const opts=parseArgs(args);
 const file=opts["--config"],stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o022)!==0)
   throw Error("M56_UNSAFE_CONFIG_FILE");
 const cfg=validateEdgeConfig(JSON.parse(fs.readFileSync(file,"utf8")));
 if(cfg.backend!=="virtual-lab"||!cfg.workload.enabled||
    !["property","host"].includes(cfg.workload.profile)||
    cfg.http.host!=="127.0.0.1")throw Error("M56_PROFILE_OR_BACKEND_DENIED");
 const driver=createLinuxIsolatedProcessDriver({namespace:opts["--namespace"],
   cgroup:opts["--cgroup"],rootfs:opts["--rootfs"],
   nodeInside:opts["--node-inside"],hostCanary:opts["--host-canary"]});
 const edge=createAutonomousEdgeHost({config:cfg,token:env.PEF_EDGE_TOKEN,workloadDriver:driver});
 try{
   const url=await edge.listen();
   const state=edge.state(),workload=state.workloads[0];
   if(workload?.actualLimitsEnforced!==true||
      workload?.isolation!=="LINUX_CGROUP_NETNS_CHROOT_CI"||
      workload.workloadId!=="pef-"+cfg.workload.profile)
     throw Error("M56_DRIVER_NOT_EFFECTIVELY_ISOLATED");
   return {edge,ready:{kind:"PEF_M56_CI_SYSTEMD_KERNEL_READY",url,
     profile:cfg.workload.profile,sessionId:state.identity.sessionId,
     actualLimitsEnforced:true,hardwareValidated:false,
     productionAuthorized:false,vmOsRebootValidated:false}};
 }catch(e){await edge.close();throw e;}
}
module.exports={parseArgs,assertM56CiScope,startM56CiService};
