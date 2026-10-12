"use strict";
// Runs inside an isolated test-only chroot, network namespace and CPU/RAM/pids cgroup.
const fs=require("node:fs"),net=require("node:net");
const {createWorkloadManager}=require("./src/core/workload-manager.js");
const {demoManifest}=require("./src/runtime/demo-workload.js");
const {createFileJournal}=require("./src/adapters/os-file-journal.js");
const {createLocalReceipts}=require("./src/core/local-receipts.js");
(async()=>{
  const m=createWorkloadManager({cpuMillicores:500,memoryMiB:128,storageMiB:128});
  const admission=m.admit(demoManifest(),{trusted:true,offline:true});
  if(!admission.ok)throw Error("ADMISSION_FAILED:"+admission.error);
  const journal=createFileJournal({dir:"/data",capacityBytes:8192,controlReserveBytes:2048});
  const service=createLocalReceipts({journal,identity:{siteId:"lab-site",deviceId:"sandbox-device",configRevision:"cfg-1"}});
  const accepted=service.receive({receiptId:"S3-001",packageId:"PKG-S3"});
  const retained=service.list();
  journal.close();
  const hostCanaryInaccessible=!fs.existsSync(process.env.PEF_HOST_SENTINEL||"/host-canary");
  const deniedNetwork=await new Promise(resolve=>{
    const socket=net.connect({host:"203.0.113.42",port:8765});
    const done=(value)=>{socket.destroy();resolve(value);};
    socket.setTimeout(400,()=>done(false));
    socket.once("connect",()=>done(false));
    socket.once("error",()=>done(true));
  });
  if(!accepted.accepted||!accepted.fsyncCompleted||retained.length!==1||
    process.getuid?.()!==65534||!hostCanaryInaccessible||!deniedNetwork)
    throw Error("ISOLATION_ASSERTION_FAILED:"+JSON.stringify({
      accepted,retained:retained.length,uid:process.getuid?.(),
      hostCanaryInaccessible,deniedNetwork
    }));
  process.stdout.write("PEF_S3_CHILD_PASS="+JSON.stringify({
    admitted:true,offlineReceipt:true,fsyncAck:true,uid:process.getuid(),
    hostCanaryInaccessible,deniedNetwork,hardwareValidated:false
  })+"\n");
})().catch(e=>{process.stderr.write("PEF_S3_CHILD_FAIL="+String(e.stack||e)+"\n");process.exitCode=1;});
