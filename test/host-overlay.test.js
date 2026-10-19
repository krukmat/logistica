"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createFileJournal}=require("../src/adapters/os-file-journal.js");
const {createSiteOperations}=require("../src/core/site-operations.js");
const {validateSiteCommand}=require("../src/core/site-operation-contract.js");
const {validateEnvelope}=require("../src/core/event-envelope.js");
const {createWorkloadManager}=require("../src/core/workload-manager.js");
const {hostManifest,propertyManifest}=require("../src/runtime/demo-workload.js");
const {validateEdgeConfig}=require("../src/runtime/edge-config.js");
const {runHostSmoke}=require("../src/emulator/lab/host-smoke.js");
const identity={siteId:"host-site",deviceId:"host-test",configRevision:"r1"};
const incident={operation:"OPEN",incidentId:"H-1",unitId:"ROOM-1",category:"MAINTENANCE",severity:"WARNING"};
test("M4.2 Host strict contract, immutable journal, conflict and restart",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-host-unit-"));
  let journal;
  try{
    assert.equal(validateSiteCommand("host",{...incident,command:"EXEC"}).ok,false);
    assert.equal(validateSiteCommand("host",{...incident,category:"GUEST_PRIVATE_DATA"}).ok,false);
    assert.equal(validateSiteCommand("property",incident).ok,false);
    journal=createFileJournal({dir,capacityBytes:8192,controlReserveBytes:1024});
    let host=createSiteOperations({profile:"host",journal,identity});
    assert.equal(host.apply({operation:"ACK",incidentId:"H-1"}).error,"HOST_INCIDENT_NOT_FOUND");
    const open=host.apply(incident);
    assert.equal(open.ok,true);assert.equal(open.fsyncCompleted,true);
    assert.equal(host.apply(incident).duplicate,true);
    assert.equal(host.apply({...incident,unitId:"ROOM-2"}).error,"EVENT_ID_CONFLICT");
    assert.equal(host.apply({operation:"ACK",incidentId:"H-1"}).fsyncCompleted,true);
    assert.equal(host.list()[0].status,"ACKNOWLEDGED");
    let retained=journal.retained().find(e=>e.eventId===open.eventId);
    assert.equal(validateEnvelope(retained.payload,retained.eventId).ok,true);
    assert.equal(validateEnvelope({...retained.payload,unitId:"",category:"MAINTENANCE"},retained.eventId).ok,false);
    journal.close();journal=null;
    journal=createFileJournal({dir,capacityBytes:8192,controlReserveBytes:1024});
    host=createSiteOperations({profile:"host",journal,identity});
    assert.equal(host.list()[0].status,"ACKNOWLEDGED");
    assert.equal(host.apply({operation:"ACK",incidentId:"H-1"}).duplicate,true);
    assert.equal(journal.status().pending,2);
  }finally{journal?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test("M4.2 policy admission denies over-budget and unauthorised workloads",()=>{
  const m=createWorkloadManager({cpuMillicores:190,memoryMiB:100,storageMiB:64,maxWorkloads:2});
  assert.equal(m.admit(hostManifest(),{trusted:false,offline:true}).error,"UNTRUSTED_WORKLOAD");
  assert.equal(m.admit(hostManifest(),{trusted:true,offline:true}).ok,true);
  assert.equal(m.admit(propertyManifest(),{trusted:true,offline:true}).error,"INSUFFICIENT_CPU");
  assert.equal(m.usage().count,1);
  assert.equal(m.release("pef-host").ok,true);
  const unsupported={...hostManifest(),workload_id:"pef-host",network_intents:[
    {kind:"egress",scope:"site",destination_class:"explicitly_approved",justification:"forbidden network"}]};
  assert.equal(m.admit(unsupported,{trusted:true,offline:true}).error,"NETWORK_INTENT_DENIED");
});
test("M4.2 bounded journal fail-closed on storage budget and no phantom Host ACK",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-host-overflow-"));
  let journal;
  try{
    journal=createFileJournal({dir,capacityBytes:1400,controlReserveBytes:300});
    const host=createSiteOperations({profile:"host",journal,identity});
    let denied=null,n=0;
    while(n<12){
      const x=host.apply({...incident,incidentId:"H-"+(++n)});
      if(!x.ok){denied=x;break;}
    }
    assert.ok(denied,"must exhaust bounded journal");
    assert.equal(denied.error,"STORAGE_FULL_OR_UNSAFE");
    assert.equal(denied.accepted,false);
    assert.equal(denied.fsyncCompleted,false);
    assert.equal(host.list().some(x=>x.incidentId==="H-"+n),false);
    assert.equal(journal.status().unsafe,false);
  }finally{journal?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test("M4.2 config permits only static Host profile",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-host-config-"));
  try{
    const cfg={schemaVersion:1,backend:"virtual-lab",
      identity,storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:250,
      workload:{enabled:true,profile:"host",reconcileMs:250},
      journal:{capacityBytes:65536,controlReserveBytes:4096},
      wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
    assert.equal(validateEdgeConfig(cfg).workload.profile,"host");
    assert.throws(()=>validateEdgeConfig({...cfg,workload:{...cfg.workload,profile:"exec:sh"}}),
      /INVALID_EDGE_WORKLOAD_OPTIONS/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("M4.2 standalone Host HTTP/worker/offline/reopen/mock replay",async()=>{
  const result=await runHostSmoke();
  assert.equal(result.status,"LAB_PASS",JSON.stringify(result));
  assert.equal(Object.values(result.checks).every(Boolean),true);
  assert.equal(result.physicalValidated,false);
  assert.equal(result.actualLimitsEnforced,false);
});

test("M4.2 fail-closed Host: disabled worker never accepts incident over API",async()=>{
  const {createAutonomousEdgeHost}=require("../src/runtime/autonomous-edge.js");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-host-disabled-"));
  const token="test-host-operator-token-32-chars-long";
  const cfg={schemaVersion:1,backend:"virtual-lab",identity,
    storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:300,
    workload:{enabled:false,profile:"host",reconcileMs:250},
    journal:{capacityBytes:65536,controlReserveBytes:4096},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
  let host;
  try{
    host=createAutonomousEdgeHost({config:cfg,token});
    const url=await host.listen();
    const denied=await fetch(url+"host/incidents",{method:"POST",
      headers:{"x-pef-token":token,"content-type":"application/json"},
      body:JSON.stringify(incident)});
    assert.equal(denied.status,409);
    assert.equal((await denied.json()).error,"HOST_WORKLOAD_NOT_ACTIVE");
    const state=await fetch(url+"state",{headers:{"x-pef-token":token}}).then(x=>x.json());
    assert.equal(state.hostIncidents.length,0);
    assert.equal(state.workloads.length,0);
  }finally{if(host)await host.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test("M4.2 process allowlist refuses arbitrary binary or unknown workload",async()=>{
  const {createNodeProcessDriver}=require("../src/adapters/node-process-driver.js");
  await assert.rejects(()=>createNodeProcessDriver().start(
    {...hostManifest(),workload_id:"exec-host-shell"},{onExit:()=>{}}),
    /WORKLOAD_BINARY_NOT_ALLOWLISTED/);
});
