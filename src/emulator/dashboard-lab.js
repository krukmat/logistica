"use strict";
// Dashboard-integrated lab controller: real fsync in a private temp directory,
// synthetic WAN probes/routes and in-memory cloud mock, no physical networking.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomUUID,randomBytes}=require("node:crypto");
const {openEdgeService}=require("../runtime/edge-service.js");
const {createLabCloudReplica}=require("./lab/cloud-replay.js");
const {openLabBoot}=require("./lab/lab-bootstrap.js");
const {runLoopbackSuite}=require("./lab/loopback.js");
const {createWorkloadManager}=require("../core/workload-manager.js");
const {createWorkloadSupervisor}=require("../core/workload-supervisor.js");
const {createNodeProcessDriver}=require("../adapters/node-process-driver.js");
const {demoManifest}=require("../runtime/demo-workload.js");
const {runStandaloneEdgeSmoke}=require("./lab/autonomous-smoke.js");
const {runM3LifecycleSmoke}=require("./lab/m3-lifecycle-smoke.js");
const {runM3RecoverySmoke}=require("./lab/m3-recovery-smoke.js");
const {runPredeviceConformance}=require("../runtime/predevice-conformance.js");
const {runGoldenTraces}=require("../runtime/golden-traces.js");
const {runDeviceIntegrationRehearsal}=require("../runtime/device-integration-rehearsal.js");
const {runCandidateScreening}=require("../runtime/device-candidate-screen.js");
const CAPABILITIES=Object.freeze([
  "wan-probes","local-routing-model","os-file-fsync","journal-pressure",
  "journal-compaction","durable-ack-replay","identity-revision","boot-session",
  "lost-remote-ack","forged-remote-ack","loopback-tcp-http","lab-evidence",
  "lab-identity-bootstrap","bounded-deadline","bounded-retry","lab-ack-proof","protocol-v1",
  "local-logistics-receipts","offline-workload-replay",
  "workload-admission","node-worker-process","bounded-supervisor","ipc-health","offline-worker-receipts",
  "ci-linux-supervised-worker","autonomous-edge-host","boot-reopen-without-dashboard",
  "predevice-port-conformance","golden-trace-parity","safe-device-integration-preflight",
  "hardware-candidate-screening","m3-headless-lifecycle","m3-policy-safe-recovery",
  "m3-operational-diagnostics","m3-same-run-evidence"
]);
const IDENTITY=Object.freeze({siteId:"demo-site",deviceId:"demo-edge",configRevision:"cfg-demo-1"});
function createDashboardLab({tmpParent=os.tmpdir()}={}){
  let dir=null,edge=null,cloud=null,history=[],route=null,revision=0,closed=false,busy=false;
  let cloudAvailable=true,profile="normal",lastResult=null,wan=null,boot=null,supervisor=null,autonomousEvidence=null,m3Evidence=null,m3RecoveryEvidence=null,m3OperationsEvidence=null,predeviceEvidence=null,goldenTraceEvidence=null,devicePreflightEvidence=null,candidateEvidence=null;
  function guard(){if(closed)throw Error("LAB_CLOSED");}
  function start(next="normal"){
    if(!["normal","pressure"].includes(next))throw Error("UNSUPPORTED_LAB_PROFILE");
    if(supervisor){void supervisor.close();supervisor=null;}
    if(edge)edge.close();
    if(dir)fs.rmSync(dir,{recursive:true,force:true});
    dir=fs.mkdtempSync(path.join(tmpParent,"pef-visual-lab-"));
    profile=next;history=[];lastResult=null;route=null;revision=0;cloudAvailable=true;autonomousEvidence=null;m3Evidence=null;m3RecoveryEvidence=null;m3OperationsEvidence=null;predeviceEvidence=null;goldenTraceEvidence=null;devicePreflightEvidence=null;candidateEvidence=null;
    wan={primary:{link:true,upstream:true},backup:{link:true,upstream:true}};
    const proofKey=randomBytes(32);
    cloud=createLabCloudReplica({siteId:IDENTITY.siteId,deviceId:IDENTITY.deviceId,
      allowedRevisions:[IDENTITY.configRevision],proofKey});
    openRuntime();
    supervisor=createWorkloadSupervisor({
      manager:createWorkloadManager({cpuMillicores:500,memoryMiB:128,storageMiB:128,maxWorkloads:2}),
      driver:createNodeProcessDriver(),autoReconcileMs:250
    });
  }
  function openRuntime(){
    boot=openLabBoot({dir,identity:IDENTITY});
    edge=openEdgeService({dir,identity:boot.identity,sessionId:boot.sessionId,
      ports:{
        probe:async id=>({...wan[id],reason:wan[id].upstream?"HEALTHY":"INJECTED_UNREACHABLE"}),
        applyRoute:async selected=>{route=selected;}
      },
      journalOptions:profile==="pressure"?{capacityBytes:2400,controlReserveBytes:400}:{capacityBytes:65536,controlReserveBytes:8192},
      simulatorOptions:{failbackHoldSeconds:3}});
  }
  function emit(action,result){
    const status=edge.status();
    lastResult=result;
    history.push({index:++revision,action,ok:result?.ok!==false&&
      result?.status!=="SYNC_INCOMPLETE"&&result?.status!=="LAB_FAIL",
      result,selectedWan:status.network.selectedWan,
      connectivity:status.network.connectivity,clock:status.network.clock});
    if(history.length>80)history.shift();
    return result;
  }
  function snapshot(){
    guard();
    const status=edge.status();
    return {kind:"PEF_DASHBOARD_INTEGRATED_LAB",profile,capabilities:[...CAPABILITIES],
      identity:status.identity,boot:{bootScope:boot.bootScope,metadataFsync:boot.metadataFsync,
        hardwareProvisioned:false,credentialsProvisioned:false},network:status.network,storage:status.storage,
      runtimeHealth:status.runtimeHealth,volatilePending:status.volatilePending,
      droppedEvidence:status.droppedEvidence,lastError:status.lastError,
      runtimeBackend:{kind:"virtual-lab",domainCore:"src/core/edge-runtime.js",
        wanPolicy:"src/core/wan-policy.js",journalPort:"OS_FILE_JOURNAL",
        kernelRouteApplied:false,physicalValidated:false},
      routeAppliedInMemory:route,wans:Object.entries(wan).map(([id,w])=>({id,...w})),
      transport:{schemaVersion:1,frame:"PEF-LAB-ACK-v1",timeoutMs:250,maxAttempts:1,
        proof:"EPHEMERAL_LAB_ONLY",authenticated:false,realNetwork:false},
      cloud:{...cloud.status(),available:cloudAvailable,
        connected:cloudAvailable&&status.network.selectedWan!==null},
      receipts:edge.listReceipts(),
      predevice:{kind:"PEF_PREDEVICE_PORT_CONFORMANCE_V1",scope:"SOFTWARE_LAB_ONLY",lastEvidence:predeviceEvidence,
        deviceBackend:"BACKEND_NOT_IMPLEMENTED",physicalValidated:false},
      goldenTraces:{kind:"PEF_GOLDEN_TRACE_REPORT_V1",scope:"SOFTWARE_LAB_ONLY",lastEvidence:goldenTraceEvidence,
        deviceBackend:"BACKEND_NOT_IMPLEMENTED",physicalValidated:false},
      devicePreflight:{kind:"PEF_DEVICE_INTEGRATION_REHEARSAL_V1",scope:"SOFTWARE_LAB_ONLY",lastEvidence:devicePreflightEvidence,
        deviceBackend:"BACKEND_NOT_IMPLEMENTED",physicalValidated:false,productionAuthorized:false},
      hardwareCandidates:{kind:"PEF_C2_HARDWARE_SCREENING_REPORT_V1",scope:"DOCUMENTED_SPECS_AND_HOST_OBSERVATIONS",
        lastEvidence:candidateEvidence,deviceBackend:"BACKEND_NOT_IMPLEMENTED",physicalValidated:false},
      standaloneEdge:{kind:"PEF_STANDALONE_SERVICE_SMOKE",scope:"LAB_ONLY",lastEvidence:autonomousEvidence,
        daemonCli:"node bin/pef-edge.js --config /absolute/config.json",physicalValidated:false},
      m3Lifecycle:{kind:"PEF_M3_LIFECYCLE_SMOKE_V1",scope:"SOFTWARE_LAB_ONLY",
        lastEvidence:m3Evidence,linuxKernelLock:"CI_ONLY",physicalValidated:false},
      m3Recovery:{kind:"PEF_M3_RECOVERY_SMOKE_V1",scope:"SOFTWARE_LAB_ONLY",
        lastEvidence:m3RecoveryEvidence,policyScope:"SUPERVISOR_POLICY_ONLY",
        physicalValidated:false,remoteRecoveryAllowed:false},
      m3Operations:{kind:"PEF_M3_OPERATIONS_LAB_V1",scope:"SOFTWARE_LAB_ONLY",
        lastEvidence:m3OperationsEvidence,physicalValidated:false,
        remoteRecoveryAllowed:false,videoAvailableHere:false},
      workloads:{entries:supervisor?.list()||[],budgets:supervisor?.limits()||{},
        reserved:supervisor?.usage()||{},runtime:"NODE_PROCESS_ONLY",
        actualLimitsEnforced:false,linuxIsolationValidated:false,
        status:"LAB_ONLY_NOT_SANDBOXED",
        linuxCiEvidence:{kind:"CI_LINUX_ISOLATED_PROCESS_DRIVER",state:"LAB_PASS_CI_ONLY",
          runId:38299458656,supervisorIntegrated:true,cpuMax:"15000 100000",
          memoryMaxBytes:67108864,swapMaxBytes:0,pidsMax:16,oomKillObserved:true,
          localProcessIsolated:false,hardwareValidated:false}},
      pending:edge.pending(30).map(x=>({eventId:x.eventId,category:x.category,
        sha256:x.sha256,configRevision:x.payload?.configRevision,sessionId:x.payload?.sessionId})),
      history:history.slice(),lastResult,physicalValidated:false,remoteAuthenticated:false,
      scope:"lab fsync + modeled routes; Linux namespace tests are CI-only"};
  }
  async function command(body){
    guard();if(busy)throw Error("LAB_BUSY");
    if(!body||typeof body!=="object")throw Error("INVALID_LAB_COMMAND");
    busy=true;
    try{
      let result;
      switch(body.action){
        case "predeviceConformance":
          predeviceEvidence=await runPredeviceConformance();
          return emit("predevice-conformance",predeviceEvidence);
        case "goldenTraces":
          goldenTraceEvidence=await runGoldenTraces();
          return emit("golden-traces",goldenTraceEvidence);
        case "devicePreflight":
          devicePreflightEvidence=await runDeviceIntegrationRehearsal();
          return emit("device-preflight",devicePreflightEvidence);
        case "hardwareScreening":
          candidateEvidence=runCandidateScreening();
          return emit("hardware-screening",candidateEvidence);
        case "autonomousSmoke":
          autonomousEvidence=await runStandaloneEdgeSmoke();
          return emit("autonomous-edge-smoke",autonomousEvidence);
        case "m3Lifecycle":
          m3Evidence=await runM3LifecycleSmoke();
          return emit("m3-autonomous-lifecycle",m3Evidence);
        case "m3Recovery":
          m3RecoveryEvidence=await runM3RecoverySmoke();
          return emit("m3-config-safe-mode",m3RecoveryEvidence);
        case "m3Operations":
          m3OperationsEvidence=await runM3RecoverySmoke();
          return emit("m3-operations-diagnostics",m3OperationsEvidence);
        case "workloadStart":
          return emit("workload-start",await supervisor.start(demoManifest(),{
            trusted:true,offline:edge.status().network.connectivity==="LOCAL_ONLY"
          }));
        case "workloadStop":
          return emit("workload-stop",await supervisor.stop("pef-receiver"));
        case "workloadCrash":
          return emit("workload-crash",await supervisor.crash("pef-receiver"));
        case "workloadReconcile":
          return emit("workload-reconcile",await supervisor.reconcile());
        case "workloadReceipt":{
          const checked=await supervisor.processReceipt("pef-receiver",{
            receiptId:body.receiptId,packageId:body.packageId});
          if(!checked.ok)return emit("workload-receipt",{ok:false,error:checked.error});
          return emit("workload-receipt",edge.receivePackage({
            receiptId:body.receiptId,packageId:body.packageId}));
        }
        case "receipt":
          return emit("receipt",edge.receivePackage({receiptId:body.receiptId,packageId:body.packageId}));
        case "sample":
          if(body.seconds!==undefined&&body.seconds!==1)throw Error("INVALID_SAMPLE_INCREMENT");
          result=await edge.sample(1);
          return emit("sample",{
            ok:result.event===null||result.event.ack===true,
            event:result.event,observed:result.observed,
            runtimeHealth:result.runtimeHealth,
            lastError:result.lastError,volatilePending:result.volatilePending});
        case "wan":
          if(!["primary","backup"].includes(body.id)||
             typeof body.upstream!=="boolean")throw Error("INVALID_LAB_WAN");
          wan[body.id].upstream=body.upstream;
          result=await edge.sample(1);
          return emit("wan:"+body.id,{ok:result.event===null||result.event.ack===true,
            injected:true,upstream:body.upstream,event:result.event,
            observed:result.observed,fsyncCompleted:Boolean(result.event?.fsyncCompleted),
            runtimeHealth:result.runtimeHealth});
        case "cloud":
          if(typeof body.available!=="boolean")throw Error("INVALID_LAB_CLOUD");
          cloudAvailable=body.available;
          return emit("cloud",{ok:true,available:cloudAvailable});
        case "sync":
          if(!cloudAvailable||edge.status().network.selectedWan===null)
            return emit("sync",{ok:false,status:"SYNC_INCOMPLETE",error:"CLOUD_UNAVAILABLE"});
          result=await edge.sync(cloud,16);
          return emit("sync",result);
        case "syncRetry":
          if(!cloudAvailable||edge.status().network.selectedWan===null)
            return emit("syncRetry",{ok:false,status:"SYNC_INCOMPLETE",error:"CLOUD_UNAVAILABLE"});
          return emit("syncRetry",await edge.sync(cloud,16,{timeoutMs:70,maxAttempts:2}));
        case "timeout":
          cloud.stallNextIngest();
          return emit("inject-timeout",{ok:true,nextIngest:"DEADLINE_EXCEEDED"});
        case "missingProof":
          cloud.omitNextProof();
          return emit("inject-no-proof",{ok:true,nextAck:"NO_PROOF"});
        case "badVersion":
          cloud.useWrongVersionNext();
          return emit("inject-schema-mismatch",{ok:true,nextAck:"WRONG_VERSION"});
        case "compact":return emit("compact",edge.compact());
        case "lostAck":
          cloud.dropNextDurableAck();
          return emit("inject-ack-loss",{ok:true,nextRemoteAck:"LOST_AFTER_REMOTE_COMMIT"});
        case "forgedAck":
          cloud.forgeNextAck();
          return emit("inject-forged-ack",{ok:true,nextRemoteAck:"INVALID_ID"});
        case "restart":
          edge.close();openRuntime();
          return emit("restart",{ok:true,sessionId:edge.status().identity.sessionId,
            note:"OS-file journal reopened; cloud mock preserved"});
        case "reset":
          start(body.profile||"normal");
          return emit("reset",{ok:true,profile,temporaryDir:true});
        case "loopback":
          result=await runLoopbackSuite();
          return emit("loopback",{
            ok:result.status==="LAB_PASS",status:result.status,
            steps:result.steps.length,failures:result.failures,
            physicalWanValidated:false});
        default:throw Error("UNKNOWN_LAB_ACTION");
      }
    }finally{busy=false;}
  }
  function close(){
    if(closed)return;closed=true;
    if(supervisor){void supervisor.close();supervisor=null;}
    if(edge)edge.close();
    if(dir)fs.rmSync(dir,{recursive:true,force:true});
  }
  start();
  return {command,snapshot,close,listReceipts:()=>edge.listReceipts()};
}
module.exports={createDashboardLab,CAPABILITIES};
