"use strict";
// S3.4–S3.6: real PRODUCT WorkloadSupervisor -> Linux isolated process-driver.
// Host supervisor stays outside cgroup; ONLY the child belongs to workload cgroup.
const fs=require("node:fs"),path=require("node:path");
const {createWorkloadManager}=require("../../src/core/workload-manager.js");
const {createWorkloadSupervisor}=require("../../src/core/workload-supervisor.js");
const {createLinuxIsolatedProcessDriver}=require("../../src/adapters/linux-isolated-process-driver.js");
const {makeLinuxIsolationPlan}=require("../../src/adapters/linux-workload-isolation.js");
const {createFileJournal}=require("../../src/adapters/os-file-journal.js");
const {createLocalReceipts}=require("../../src/core/local-receipts.js");
const {demoManifest}=require("../../src/runtime/demo-workload.js");
async function eventually(fn,label,limitMs=5000){
  const start=Date.now();
  while(Date.now()-start<limitMs){
    if(fn())return;
    await new Promise(r=>setTimeout(r,30));
  }
  throw Error("S3_ASSERTION_TIMEOUT:"+label);
}
async function run(){
  const [namespace,cgroup,rootfs,nodeInside,journalDir,hostCanary]=process.argv.slice(2);
  if(!namespace||!cgroup||!rootfs||!nodeInside||!journalDir||!hostCanary)
    throw Error("INVALID_S3_TEST_ARGUMENTS");
  const manifest=demoManifest(),plan=makeLinuxIsolationPlan(manifest);
  const manager=createWorkloadManager({cpuMillicores:500,memoryMiB:128,storageMiB:128});
  const driver=createLinuxIsolatedProcessDriver({namespace,cgroup,rootfs,nodeInside,hostCanary});
  const supervisor=createWorkloadSupervisor({manager,driver,autoReconcileMs:100});
  const journal=createFileJournal({dir:journalDir,capacityBytes:8192,controlReserveBytes:2048});
  const receiver=createLocalReceipts({journal,identity:{
    siteId:"s3-supervised-lab",deviceId:"s3-edge",configRevision:"cfg-1"}});
  const checks=[];
  function check(name,result){if(!result)throw Error("S3_ASSERTION_FAILED:"+name);checks.push(name);}
  try{
    const launched=await supervisor.start(manifest,{trusted:true,offline:true});
    check("SUPERVISOR_START",launched.ok===true&&launched.state==="RUNNING");
    check("KERNEL_ADAPTER_SELECTED",launched.actualLimitsEnforced===true&&
      launched.isolation==="LINUX_CGROUP_NETNS_CHROOT_CI");
    const w=await supervisor.processReceipt("pef-receiver",{
      receiptId:"S3-LAB-001",packageId:"PKG-OFFLINE"});
    check("WORKER_IPC_RECEIPT",w.ok===true);
    const committed=receiver.receive({receiptId:"S3-LAB-001",packageId:"PKG-OFFLINE"});
    check("OFFLINE_P1_FSYNC",committed.accepted===true&&committed.fsyncCompleted===true);
    check("HEALTH",supervisor.list()[0].state==="RUNNING"&&
      (await supervisor.reconcile()).status[0].state==="RUNNING");
    const crashed=await supervisor.crash("pef-receiver");
    check("CRASH_INJECTION",crashed.ok===true);
    await eventually(()=>supervisor.list()[0]?.state==="BACKOFF","crash-backoff");
    check("CORE_STAYS_ALIVE",receiver.list().length===1&&
      (await supervisor.processReceipt("pef-receiver",{
        receiptId:"S3-LAB-002",packageId:"PKG-OFFLINE"})).error==="WORKLOAD_NOT_RUNNING");
    await eventually(()=>supervisor.list()[0]?.state==="RUNNING","autonomous-restart",6000);
    check("AUTONOMOUS_RESTART",supervisor.list()[0].attempts===1);
    const cpuBefore=fs.readFileSync(path.join(cgroup,"cpu.stat"),"utf8");
    // CPU fault is bounded to 1 second *inside* the constrained child.
    const cpustat=()=>fs.readFileSync(path.join(cgroup,"cpu.stat"),"utf8");
    check("CGROUP_LIMITS",fs.readFileSync(path.join(cgroup,"cpu.max"),"utf8").trim()===plan.cpuMax&&
      fs.readFileSync(path.join(cgroup,"memory.max"),"utf8").trim()===plan.memoryMax);
    // Trigger via supervisor port (never by mutating driver internals).
    const cpu=await supervisor.injectFault("pef-receiver","CPU_BURN");
    check("CPU_FAULT_DELIVERED",cpu.ok===true);
    const throttled=s=>Number(s.match(/^nr_throttled\s+(\d+)/m)?.[1]||0);
    const cpuAfter=cpustat();
    check("CPU_THROTTLED",throttled(cpuAfter)>throttled(cpuBefore));
    const memory=await supervisor.injectFault("pef-receiver","MEMORY_PRESSURE");
    check("MEMORY_FAULT_DELIVERED",memory.ok===true);
    await eventually(()=>supervisor.list()[0]?.state==="BACKOFF","memory-fault-backoff",20000);
    const events=fs.readFileSync(path.join(cgroup,"memory.events"),"utf8");
    const oom=Number(events.match(/^oom_kill\s+(\d+)/m)?.[1]||0);
    const denied=Number(events.match(/^max\\s+(\\d+)/m)?.[1]||0);
    process.stdout.write("PEF_S34_MEMORY_EVENTS="+JSON.stringify({
      oomKill:oom,limitEvents:denied,
      memoryCurrent:fs.readFileSync(path.join(cgroup,"memory.current"),"utf8").trim(),
      supervisorState:supervisor.list()[0]
    })+"\\n");
    check("MEMORY_LIMIT_EVENT_RECORDED",denied>0||oom>0);
    await eventually(()=>supervisor.list()[0]?.state==="RUNNING","memory-restart",6000);
    check("RESTART_AFTER_OOM",supervisor.list()[0].attempts===2);
    const stopped=await supervisor.stop("pef-receiver");
    check("STOP_AND_RELEASE",stopped.ok===true&&supervisor.list().length===0&&
      manager.usage().count===0);
    check("RECEIPT_PERSISTS",receiver.list().length===1);
    process.stdout.write("PEF_S34_SUPERVISED_LINUX_PASS="+JSON.stringify({
      status:"LAB_PASS",checks,
      cpuMax:plan.cpuMax,memoryMax:plan.memoryMax,oomKill:oom,memoryLimitEvents:denied,
      supervisorRestarts:2,offlineFsync:true,hardwareValidated:false
    })+"\n");
  }finally{
    await supervisor.close();
    journal.close();
  }
}
run().catch(err=>{console.error("PEF_S34_SUPERVISED_LINUX_FAIL="+String(err.stack||err));process.exitCode=1;});
