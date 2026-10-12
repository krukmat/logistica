"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createWorkloadManager,validateWorkloadManifest}=require("../src/core/workload-manager.js");
const {createWorkloadSupervisor}=require("../src/core/workload-supervisor.js");
const {createNodeProcessDriver}=require("../src/adapters/node-process-driver.js");
const {demoManifest}=require("../src/runtime/demo-workload.js");
test("S1 validates complete v0.1 manifest and rejects insufficient trust, resources, network escalation",()=>{
  const manifest=demoManifest(),m=createWorkloadManager({cpuMillicores:200,memoryMiB:80,storageMiB:24});
  assert.equal(validateWorkloadManifest(manifest).ok,true);
  assert.equal(m.admit(manifest).error,"UNTRUSTED_WORKLOAD");
  assert.equal(m.admit({...manifest,network_intents:[{kind:"egress",scope:"site",justification:"all outbound"}]},{trusted:true}).error,
    "NETWORK_INTENT_DENIED");
  assert.equal(m.admit({...manifest,resources:{...manifest.resources,cpu_limit_millicores:60}},{trusted:true}).error,
    "RESOURCE_REQUEST_EXCEEDS_LIMIT");
  assert.equal(m.admit({...manifest,resources:{...manifest.resources,memory_limit_mib:100}},{trusted:true}).error,
    "INSUFFICIENT_MEMORY");
  assert.equal(m.admit({...manifest,connectivity_mode:"INTERNET_REQUIRED"},{trusted:true,offline:true}).error,
    "WORKLOAD_REQUIRES_WAN");
  assert.equal(m.admit(manifest,{trusted:true,offline:true}).ok,true);
  assert.equal(m.usage().memoryMiB,64);
  assert.equal(m.admit(manifest,{trusted:true}).error,"ALREADY_ADMITTED");
  const copy=m.get(manifest.workload_id);
  copy.resources.memory_limit_mib=0;
  assert.equal(m.get(manifest.workload_id).resources.memory_limit_mib,64);
  assert.equal(m.release(manifest.workload_id).ok,true);
  assert.equal(m.usage().memoryMiB,0);
});
test("S2 launches real allowlisted child, IPC health/receipt, crash → backoff → restart → isolation",async()=>{
  let now=10000;
  const manager=createWorkloadManager(),sup=createWorkloadSupervisor({
    manager,driver:createNodeProcessDriver(),clock:()=>now});
  const manifest=demoManifest();
  try{
    const run=await sup.start(manifest,{trusted:true,offline:true});
    assert.equal(run.ok,true,JSON.stringify(run));
    assert.equal(run.state,"RUNNING");
    assert.equal(run.actualLimitsEnforced,false);
    assert.equal(run.isolation,"NODE_PROCESS_ONLY");
    assert.equal((await sup.processReceipt("pef-receiver",{receiptId:"R99",packageId:"PKG99"})).ok,true);
    assert.equal((await sup.processReceipt("pef-receiver",{receiptId:"../",packageId:"PKG99"})).ok,false);
    assert.equal((await sup.reconcile()).status[0].state,"RUNNING");
    await sup.crash("pef-receiver");
    for(let i=0;i<50&&sup.list()[0]?.state==="RUNNING";i++)
      await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(sup.list()[0].state,"BACKOFF");
    assert.equal((await sup.processReceipt("pef-receiver",{receiptId:"R99",packageId:"PKG99"})).error,"WORKLOAD_NOT_RUNNING");
    now+=1000;
    const recovery=await sup.reconcile();
    assert.equal(recovery.status[0].state,"RUNNING");
    await sup.crash("pef-receiver");
    for(let i=0;i<50&&sup.list()[0]?.state==="RUNNING";i++)
      await new Promise(resolve=>setTimeout(resolve,15));
    now+=2000;
    assert.equal((await sup.reconcile()).status[0].state,"RUNNING");
    await sup.crash("pef-receiver");
    for(let i=0;i<50&&sup.list()[0]?.state==="RUNNING";i++)
      await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(sup.list()[0].state,"ISOLATED");
    assert.equal(manager.usage().count,1);
    assert.equal((await sup.stop("pef-receiver")).state,"STOPPED");
    assert.equal(manager.usage().count,0);
  }finally{await sup.close();}
});
test("S2 never launches arbitrary workload binary or shell when manager admits valid other ID",async()=>{
  const sup=createWorkloadSupervisor({manager:createWorkloadManager(),driver:createNodeProcessDriver()});
  try{
    const manifest={...demoManifest(),workload_id:"arbitrary-command"};
    const result=await sup.start(manifest,{trusted:true});
    assert.equal(result.ok,false);
    assert.match(result.lastError,/WORKLOAD_BINARY_NOT_ALLOWLISTED/);
    assert.equal(result.state,"BACKOFF");
  }finally{await sup.close();}
});

test("S2 host timer restarts crashed worker without UI command and isolates after bounded attempts",async()=>{
  let now=10000;
  const supervisor=createWorkloadSupervisor({
    manager:createWorkloadManager(),driver:createNodeProcessDriver(),
    clock:()=>now,autoReconcileMs:100
  });
  const until=async(check,label)=>{
    for(let i=0;i<75;i++){
      if(check())return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.fail("Timed out: "+label+" "+JSON.stringify(supervisor.list()));
  };
  try{
    const start=await supervisor.start(demoManifest(),{trusted:true,offline:true});
    assert.equal(start.state,"RUNNING");
    assert.equal((await supervisor.crash("pef-receiver")).ok,true);
    await until(()=>supervisor.list()[0]?.state==="BACKOFF","first backoff");
    now+=1000;
    await until(()=>supervisor.list()[0]?.state==="RUNNING","automatic restart");
    assert.equal(supervisor.list()[0].attempts,1);
    assert.equal((await supervisor.crash("pef-receiver")).ok,true);
    await until(()=>supervisor.list()[0]?.state==="BACKOFF","second backoff");
    now+=2000;
    await until(()=>supervisor.list()[0]?.state==="RUNNING","second automatic restart");
    assert.equal((await supervisor.crash("pef-receiver")).ok,true);
    await until(()=>supervisor.list()[0]?.state==="ISOLATED","circuit-breaker");
    assert.equal(supervisor.list()[0].attempts,3);
    assert.equal((await supervisor.processReceipt("pef-receiver",{receiptId:"S3",packageId:"BOX3"})).error,
      "WORKLOAD_NOT_RUNNING");
  }finally{await supervisor.close();}
});
