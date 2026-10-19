"use strict";
// M4.3 LAB ONLY: parity, runtime/port faults and reproducible scoped source/CPU/RSS observations.
// No privileged adapter, production metrics endpoint or physical power-loss claim.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {performance}=require("node:perf_hooks");
const {randomBytes}=require("node:crypto");
const {createAutonomousEdgeHost}=require("./autonomous-edge.js");
const {createNodeProcessDriver}=require("../adapters/node-process-driver.js");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {createSiteOperations}=require("../core/site-operations.js");
const {createWorkloadManager}=require("../core/workload-manager.js");
const {createWorkloadSupervisor}=require("../core/workload-supervisor.js");
const {validateEnvelope}=require("../core/event-envelope.js");
const {propertyManifest,hostManifest}=require("./demo-workload.js");

const ROOT=path.resolve(__dirname,"../..");
const sharedPaths=Object.freeze([
  "src/core/site-operation-contract.js","src/core/site-operations.js",
  "src/core/edge-runtime.js","src/core/workload-manager.js",
  "src/core/workload-supervisor.js","src/adapters/os-file-journal.js",
  "src/adapters/node-process-driver.js","src/workloads/site-operations-worker.js",
  "src/runtime/autonomous-edge.js"
]);
const propertySpecific=Object.freeze(["src/core/property-incidents.js"]);
const legacyCandidate=Object.freeze(["src/workloads/property-worker.js"]);
const profiles=Object.freeze({
  property:{id:"PARITY-1",workload:"pef-property",
    open:{operation:"ALERT",incidentId:"PARITY-1",assetId:"PUMP-02",severity:"WARNING"}},
  host:{id:"PARITY-1",workload:"pef-host",
    open:{operation:"OPEN",incidentId:"PARITY-1",unitId:"CABIN-07",
      category:"MAINTENANCE",severity:"WARNING"}}
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const temp=fn=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m43-"));
  return Promise.resolve().then(()=>fn(dir)).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
};
function measureSource(){
  const selected=[...sharedPaths,...propertySpecific,...legacyCandidate];
  const paths=selected.map(file=>{
    const content=fs.readFileSync(path.join(ROOT,file),"utf8");
    return {path:file,lines:content.split("\n").filter((_,i,a)=>i<a.length-1||a[i]!=="").length,
      bytes:Buffer.byteLength(content),classification:sharedPaths.includes(file)?"SHARED":
        propertySpecific.includes(file)?"PROPERTY_COMPAT":"UNUSED_LEGACY_CANDIDATE"};
  });
  const sum=group=>paths.filter(x=>group.includes(x.path)).reduce((n,x)=>n+x.lines,0);
  const sharedLines=sum(sharedPaths),propertyLines=sum(propertySpecific),legacyLines=sum(legacyCandidate);
  return {kind:"PEF_M4_SCOPED_SOURCE_METRICS_V1",
    sourceMethod:"physical non-empty-file line count, including comments/blank lines; excludes last empty split",
    selectionMethod:"explicit, versioned runtime/operations representative paths; not complete PEF repository",
    selectedPaths:paths,
    sharedFiles:sharedPaths.length,propertyCompatibilityFiles:propertySpecific.length,
    hostSpecificFiles:0,unusedLegacyCandidates:legacyCandidate.length,
    sharedLines,propertyCompatibilityLines:propertyLines,unusedLegacyLines:legacyLines,
    selectedRuntimeSharePercent:Number((100*sharedLines/(sharedLines+propertyLines)).toFixed(2)),
    ratioScope:"ONLY_SELECTED_ACTIVE_FILES_EXCLUDING_UNUSED_LEGACY; NOT_WHOLE_PRODUCT_REUSE",
    recommendations:["Remove unused property-worker.js only after verifying references",
      "Do not infer product-level 90-95% reuse from selected source files"]};
}
function fixtureParity(){
  return temp(async dir=>{
    const identity={siteId:"parity-site",deviceId:"parity-edge",configRevision:"r1"};
    const journal=createFileJournal({dir,capacityBytes:16000,controlReserveBytes:2048});
    let second=null;
    try{
      // Original M4.1 envelope fields/order preserved, not reconstructed via new Domain apply().
      const eventId="property.parity-edge.LEGACY-1.alert";
      const payload={schemaVersion:1,...identity,eventType:"PROPERTY_ALERT_RAISED",
        eventId,correlationId:"property.parity-edge.LEGACY-1",
        incidentId:"LEGACY-1",assetId:"PUMP-OLD",severity:"CRITICAL",localOnlyCapable:true};
      const original=journal.append({eventId,category:"O1",payload});
      const originalDigest=journal.retained().find(x=>x.eventId===eventId)?.sha256;
      const property=createSiteOperations({profile:"property",journal,identity});
      const host=createSiteOperations({profile:"host",journal,identity});
      const checks={
        LEGACY_PROPERTY_ENVELOPE:validateEnvelope(payload,eventId).ok===true,
        ORIGINAL_SHA_UNCHANGED:original.ack===true&&/^[a-f0-9]{64}$/.test(originalDigest),
        LEGACY_LIST:property.list().length===1&&property.list()[0].assetId==="PUMP-OLD",
        HOST_DOES_NOT_READ_PROPERTY:host.list().length===0,
        SCOPED_IDENTITY_EMPTY:createSiteOperations({profile:"property",journal,
          identity:{...identity,deviceId:"other-edge"}}).list().length===0,
        NO_SHARED_EVENT_NAMESPACE:host.apply(profiles.host.open).eventId===
          "host.parity-edge.PARITY-1.open",
        CROSS_PROFILE_OPERATION_REJECTED:property.apply(profiles.host.open).ok===false&&
          host.apply(profiles.property.open).ok===false,
        COMPAT_PROPERTY_DUPLICATE:property.apply({operation:"ALERT",incidentId:"LEGACY-1",
          assetId:"PUMP-OLD",severity:"CRITICAL"}).duplicate===true
      };
      journal.close();
      second=createFileJournal({dir,capacityBytes:16000,controlReserveBytes:2048});
      checks.REOPEN_LEGACY_AND_HOST=createSiteOperations({profile:"property",journal:second,
        identity}).list().some(x=>x.incidentId==="LEGACY-1")&&
        createSiteOperations({profile:"host",journal:second,identity}).list().some(x=>x.incidentId==="PARITY-1");
      return {status:Object.values(checks).every(Boolean)?"LAB_PASS":"LAB_FAIL",
        checks,retained:second.status().retainedEvents,originalDigest,
        classification:"CORE_SHARED_PROFILE_SCOPED"};
    }finally{if(second)second.close();else journal.close();}
  });
}
async function simulatePolicyFaults(profile){
  const manifest=profile==="host"?hostManifest():propertyManifest();
  const denied=createWorkloadManager({cpuMillicores:manifest.resources.cpu_limit_millicores-1,
    memoryMiB:256,storageMiB:256});
  const admission=denied.admit(manifest,{trusted:true,offline:true});
  const noTrust=createWorkloadManager().admit(manifest,{trusted:false,offline:true});
  let now=1000,healthy=true,stops=0,exits=[];
  const manager=createWorkloadManager();
  const supervisor=createWorkloadSupervisor({manager,clock:()=>now,
    driver:{async start(_,{onExit}){exits.push(onExit);return {
      async health(){return {ok:healthy};},async stop(){stops++;}};}}});
  let checks={};
  try{
    const initial=await supervisor.start(manifest,{trusted:true,offline:true});
    checks.ADMISSION_DENIED_WITHOUT_CPU=admission.error==="INSUFFICIENT_CPU";
    checks.UNTRUSTED_DENIED=noTrust.error==="UNTRUSTED_WORKLOAD";
    checks.SUPERVISOR_BOOT=initial.ok===true;
    healthy=false;
    await supervisor.reconcile();
    checks.HEALTH_FAIL_BACKOFF=supervisor.list()[0].state==="BACKOFF"&&
      supervisor.list()[0].lastError==="HEALTH_CHECK_FAILED"&&stops===1;
    now=supervisor.list()[0].nextRetryAt;healthy=true;await supervisor.reconcile();
    checks.HEALTH_RECOVERY=supervisor.list()[0].state==="RUNNING";
    // Two more exits in the bounded 60s window: third failure isolates.
    exits[exits.length-1]("INJECTED_EXIT_2");
    now=supervisor.list()[0].nextRetryAt;await supervisor.reconcile();
    checks.BOUNDED_RESTART=supervisor.list()[0].state==="RUNNING"&&supervisor.list()[0].attempts===2;
    exits[exits.length-1]("INJECTED_EXIT_3");
    checks.EXHAUSTION_ISOLATES=supervisor.list()[0].state==="ISOLATED"&&
      supervisor.list()[0].nextRetryAt===null&&supervisor.list()[0].attempts===3;
    checks.OPERATION_REJECTED_IN_ISOLATION=(await supervisor.processOperation(manifest.workload_id,
      profile.toUpperCase(),profiles[profile].open)).error==="WORKLOAD_NOT_RUNNING";
    return {status:Object.values(checks).every(Boolean)?"LAB_PASS":"LAB_FAIL",
      checks,port:"SYNTHETIC_PROCESS_DRIVER",fakeClock:true,realKernelEnforcement:false};
  }finally{await supervisor.close();}
}
async function storageFaults(profile){
  return temp(async dir=>{
    const identity={siteId:"fault-site",deviceId:"fault-edge",configRevision:"r1"};
    let journal=createFileJournal({dir,capacityBytes:1300,controlReserveBytes:300});
    const checks={};
    let attempts=0;
    try{
      const ops=createSiteOperations({profile,journal,identity});
      let rejected=null;
      for(let i=1;i<=16;i++){
        const next={...profiles[profile].open,incidentId:"S-"+i};
        const result=ops.apply(next);attempts++;
        if(!result.ok){rejected={result,id:next.incidentId};break;}
      }
      checks.FULL_DENIED=rejected?.result.error==="STORAGE_FULL_OR_UNSAFE"&&
        rejected.result.accepted===false&&rejected.result.fsyncCompleted===false;
      checks.NO_PHANTOM_RECORD=!ops.list().some(x=>x.incidentId===rejected?.id);
      checks.RESERVE_PROTECTED=journal.status().unsafe===false&&
        journal.status().bytesUsed<=journal.status().regularWriteLimitBytes;
    }finally{journal.close();}
    const dir2=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m43-fsync-"));
    let faultJournal=null;
    try{
      let inject=true;
      const fsOps=Object.create(fs);
      fsOps.fsyncSync=(fd)=>{if(inject){inject=false;throw Error("INJECTED_FSYNC_FAILURE");}return fs.fsyncSync(fd);};
      faultJournal=createFileJournal({dir:dir2,capacityBytes:8192,controlReserveBytes:1000,fsOps});
      const ops=createSiteOperations({profile,journal:faultJournal,identity});
      const denied=ops.apply({...profiles[profile].open,incidentId:"FSYNC-1"});
      checks.FSYNC_FAILURE_NO_ACK=denied.ok===false&&denied.accepted===false&&
        denied.fsyncCompleted===false&&denied.error==="STORAGE_UNSAFE";
      checks.UNSAFE_LOCKS_OUT=faultJournal.status().unsafe===true&&
        ops.apply({...profiles[profile].open,incidentId:"FSYNC-2"}).ok===false;
    }finally{faultJournal?.close();fs.rmSync(dir2,{recursive:true,force:true});}
    return {status:Object.values(checks).every(Boolean)?"LAB_PASS":"LAB_FAIL",
      checks,attempts,io:"REAL_TEMP_FILE_WITH_INJECTED_FSYNC_FAULT",
      fsyncOutcome:"UNCERTAIN_BYTES_AFTER_FAILURE_NO_ACK",physicalPowerCutValidated:false};
  });
}
function makeConfig(dir,profile){
  return {schemaVersion:1,backend:"virtual-lab",
    identity:{siteId:"m43-site",deviceId:"m43-"+profile,configRevision:"r1"},
    storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:300,
    workload:{enabled:true,profile,reconcileMs:200},
    journal:{capacityBytes:65536,controlReserveBytes:4096},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
}
async function waitFor(probe,timeoutMs=6000){
  const started=performance.now();
  while(performance.now()-started<timeoutMs){
    const result=await probe();
    if(result)return {value:result,ms:Number((performance.now()-started).toFixed(2))};
    await sleep(40);
  }
  throw Error("M43_WAIT_TIMEOUT");
}
async function realRuntime(profile){
  return temp(async dir=>{
    const token=randomBytes(32).toString("hex"),config=makeConfig(dir,profile);
    const workerId="pef-"+profile,endpoint=profile+"/incidents";
    const createDriver=()=>{let latest=null;return {
      driver:{async start(manifest,opts){
        const child=await createNodeProcessDriver().start(manifest,opts);latest=child;return child;
      }},get:()=>latest};};
    const req=async(url,route,body)=>{
      const response=await fetch(url+route,{method:body?"POST":"GET",
        headers:{"x-pef-token":token,...(body?{"content-type":"application/json"}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      return {http:response.status,...await response.json()};
    };
    let edge=null,first=null,second=null;
    const checks={},metrics={};
    try{
      first=createDriver();edge=createAutonomousEdgeHost({config,token,workloadDriver:first.driver});
      let url=await edge.listen();
      let before=await req(url,"state");
      checks.SAME_WORKLOAD_PORT=before.workloads.length===1&&
        before.workloads[0].workloadId===workerId&&before.activeOverlay===profile&&
        before.workloads[0].actualLimitsEnforced===false;
      checks.WAN_LOCAL_ONLY=before.network.connectivity==="LOCAL_ONLY";
      const m=await first.get().metrics();
      metrics.workerBefore=m.observations;
      const t0=performance.now();
      const opened=await req(url,endpoint,profiles[profile].open);
      metrics.openHttpMs=Number((performance.now()-t0).toFixed(3));
      checks.OPERATION_FSYNC=opened.http===201&&opened.fsyncCompleted===true;
      const crash=await first.get().injectCrash();
      checks.REAL_CHILD_CRASH_REQUESTED=crash.ok===true;
      const down=await waitFor(async()=>{
        const s=await req(url,"state");
        return s.workloads[0]?.state==="BACKOFF"?s:null;
      });
      metrics.backoffObserveMs=down.ms;
      checks.REAL_CHILD_DOWN=down.value.workloads[0].state==="BACKOFF"&&
        (await req(url,"ready")).http===503;
      checks.FAIL_CLOSED_WHILE_DOWN=(await req(url,endpoint,
        {operation:"ACK",incidentId:profiles[profile].id})).http===409;
      const recovered=await waitFor(async()=>{
        const s=await req(url,"state");
        return s.workloads[0]?.state==="RUNNING"&&s.workloads[0].attempts>=1?s:null;
      });
      metrics.restartObserveMs=recovered.ms;
      checks.REAL_CHILD_RESTART=recovered.value.workloads[0].state==="RUNNING"&&
        (await req(url,"ready")).http===200;
      metrics.workerAfter=(await first.get().metrics()).observations;
      const t1=performance.now();
      const ack=await req(url,endpoint,{operation:"ACK",incidentId:profiles[profile].id});
      metrics.ackHttpMs=Number((performance.now()-t1).toFixed(3));
      checks.ACK_FSYNC_AFTER_CRASH=ack.http===201&&ack.fsyncCompleted===true;
      before=await req(url,"state");
      metrics.journalBytesBeforeReopen=before.storage.bytesUsed;
      checks.OFFLINE_RETAINS=before.network.connectivity==="LOCAL_ONLY"&&
        before[profile+"Incidents"][0].status==="ACKNOWLEDGED";
      await edge.close();edge=null;
      second=createDriver();edge=createAutonomousEdgeHost({config,token,workloadDriver:second.driver});
      url=await edge.listen();
      let reopened=await req(url,"state");
      checks.REOPEN_PERSISTS=reopened.identity.sessionId!==before.identity.sessionId&&
        reopened[profile+"Incidents"][0].status==="ACKNOWLEDGED"&&
        reopened[profile+"Incidents"][0].cloudAcked===false;
      const other=profile==="host"?"property":"host";
      checks.PROFILE_NOT_CROSS_WRITABLE=(await req(url,other+"/incidents",
        profiles[other].open)).http===409;
      checks.AUTH_REQUIRED=(await fetch(url+endpoint)).status===403;
      checks.OFFLINE_CLOUD_BLOCKED=(await req(url,"lab/sync",{})).http===409;
      await req(url,"lab/wan",{id:"primary",upstream:true});
      await req(url,"lab/sample",{});
      await req(url,"lab/cloud/fault",{fault:"drop-next-ack"});
      const incomplete=await req(url,"lab/sync",{});
      checks.LOST_REMOTE_ACK_RETAINED=incomplete.http===409&&
        incomplete.result?.error==="REMOTE_ACK_LOST"&&
        (await req(url,"state")).storage.pending>0;
      const replay=await req(url,"lab/sync",{});
      reopened=await req(url,"state");
      metrics.journalBytesAfterReplay=reopened.storage.bytesUsed;
      checks.MOCK_DUPLICATE_REPLAY=replay.http===200&&replay.result?.duplicates>=1&&
        reopened.storage.pending===0&&reopened[profile+"Incidents"][0].cloudAcked===true&&
        reopened[profile+"Incidents"][0].ackCloudAcked===true;
      const ok=Object.values(checks).every(Boolean);
      return {status:ok?"LAB_PASS":"LAB_FAIL",checks,observedMetrics:metrics,
        eventsAfterReplay:reopened.storage.pending,workerId,
        isolation:"NODE_PROCESS_ONLY",actualLimitsEnforced:false,
        httpLoopback:true,network:"SYNTHETIC",cloud:"LOCAL_MOCK",
        processCrash:"ACTUAL_NODE_CHILD",powerCutValidated:false};
    }finally{if(edge)await edge.close();}
  });
}
async function runM4Commonality(){
  const parity=await fixtureParity();
  const source=measureSource();
  const results={};
  for(const profile of ["property","host"]){
    const runtime=await realRuntime(profile);
    const supervisor=await simulatePolicyFaults(profile);
    const storage=await storageFaults(profile);
    const manifest=profile==="property"?propertyManifest():hostManifest();
    results[profile]={runtime,supervisor,storage,
      declaredResources:manifest.resources,connectivityMode:manifest.connectivity_mode,
      passed:[runtime,supervisor,storage].every(x=>x.status==="LAB_PASS")};
  }
  const ok=parity.status==="LAB_PASS"&&Object.values(results).every(x=>x.passed);
  return {kind:"PEF_M4_COMMONALITY_RESILIENCE_V1",status:ok?"LAB_PASS":"LAB_FAIL",ok,
    parity,profiles:results,source,metricScope:"ONE_SMALL_SYNTHETIC_SCENARIO_PER_PROFILE_NOT_BENCHMARK",
    hardwareValidated:false,physicalPowerCutValidated:false,
    propertyHostLinuxIsolationValidated:false,remoteCloudProvisioned:false};
}
module.exports={runM4Commonality,measureSource,fixtureParity,simulatePolicyFaults,storageFaults,realRuntime};
