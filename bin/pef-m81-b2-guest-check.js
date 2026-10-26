#!/usr/bin/env node
"use strict";
// M8.1.B2 read-only VM gate. No cgroup, netns, service or filesystem mutation.
const fs=require("node:fs"),{spawnSync}=require("node:child_process");
const {readM81LimaGuestFacts,assessM81LimaScope}=
 require("../src/adapters/m81-lima-isolation-scope.js");
const REQUIRED_TOOLS=["node","ip","chroot","cp","ldd","awk","readlink",
 "stat","mktemp","timeout","openssl"];
const run=(command,args)=>spawnSync(command,args,{encoding:"utf8",
 timeout:3000,stdio:["ignore","pipe","pipe"]});
function inspect(){
 const facts=readM81LimaGuestFacts();
 const b1=assessM81LimaScope(facts);
 const checks={GUEST_B1_SCOPE:b1.ok};
 const details={};
 let subtrees=[];
 try{subtrees=fs.readFileSync("/sys/fs/cgroup/cgroup.subtree_control","utf8")
  .trim().split(/\s+/).filter(Boolean);}catch{}
 checks.CGROUP_ROOT_DELEGATION=["cpu","memory","pids"].every(x=>subtrees.includes(x));
 details.delegatedControllers=subtrees;
 const tmpfs=run("stat",["-f","-c","%T","/sys/fs/cgroup"]);
 checks.CGROUP_V2_MOUNT=tmpfs.status===0&&tmpfs.stdout.trim()==="cgroup2fs";
 const missingTools=REQUIRED_TOOLS.filter(x=>run("/bin/sh",["-c",
  "command -v "+x+" >/dev/null 2>&1"]).status!==0);
 checks.GUEST_TOOLCHAIN_COMPLETE=missingTools.length===0;
 details.missingTools=missingTools;
 let nodePath=null;
 try{nodePath=fs.realpathSync(process.execPath);}catch{}
 checks.PINNED_NODE_BINARY=["/usr/bin/node","/usr/local/bin/node"].includes(nodePath);
 details.nodePath=nodePath;
 checks.NODE_ARCH_NATIVE=process.arch==="arm64";
 checks.NODE_EXTERNALIZED_UNDICI_FETCH_PRESENT=
  fs.existsSync("/usr/share/nodejs/undici/undici-fetch.js")&&
  fs.statSync("/usr/share/nodejs/undici/undici-fetch.js").isFile();

 const failed=Object.keys(checks).filter(x=>!checks[x]);
 return {kind:"PEF_M81_B2_READ_ONLY_PREFLIGHT_V1",task:"M8.1.B2",
  status:failed.length?"BLOCKED":"READY_FOR_OPERATOR_OPT_IN",
  ok:failed.length===0,checks,failed,
  profile:"pef-r28s-1g",hostname:facts.hostname,
  guestMemoryMiB:facts.memoryMiB,nodeMajor:facts.nodeMajor,
  details,readOnly:true,guestServicesModified:false,guestSandboxStarted:false,
  macHostModified:false,operatorRunApproved:false,
  kernelIsolationValidated:false,systemdManagedValidated:false,
  vmRebootValidated:false,physicalValidated:false,
  nextGate:"Separate B2 privileged guest operator approval"};
}
if(process.argv.length!==2){console.error("M81_B2_PREFLIGHT_USAGE: no arguments");process.exit(2);}
const result=inspect();
console.log(JSON.stringify(result,null,2));
if(!result.ok)process.exitCode=78;
module.exports={inspect};
