"use strict";
// Dashboard-integrated lab controller: real fsync in a private temp directory,
// synthetic WAN probes/routes and in-memory cloud mock, no physical networking.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomUUID}=require("node:crypto");
const {createEdgeRuntime}=require("./lab/edge-runtime.js");
const {createLabCloudReplica}=require("./lab/cloud-replay.js");
const {runLoopbackSuite}=require("./lab/loopback.js");
const CAPABILITIES=Object.freeze([
  "wan-probes","local-routing-model","os-file-fsync","journal-pressure",
  "journal-compaction","durable-ack-replay","identity-revision","boot-session",
  "lost-remote-ack","forged-remote-ack","loopback-tcp-http","lab-evidence"
]);
const IDENTITY=Object.freeze({siteId:"demo-site",deviceId:"demo-edge",configRevision:"cfg-demo-1"});
function createDashboardLab({tmpParent=os.tmpdir()}={}){
  let dir=null,edge=null,cloud=null,history=[],route=null,revision=0,closed=false,busy=false;
  let cloudAvailable=true,profile="normal",lastResult=null,wan=null;
  function guard(){if(closed)throw Error("LAB_CLOSED");}
  function start(next="normal"){
    if(!["normal","pressure"].includes(next))throw Error("UNSUPPORTED_LAB_PROFILE");
    if(edge)edge.close();
    if(dir)fs.rmSync(dir,{recursive:true,force:true});
    dir=fs.mkdtempSync(path.join(tmpParent,"pef-visual-lab-"));
    profile=next;history=[];lastResult=null;route=null;revision=0;cloudAvailable=true;
    wan={primary:{link:true,upstream:true},backup:{link:true,upstream:true}};
    cloud=createLabCloudReplica({siteId:IDENTITY.siteId,deviceId:IDENTITY.deviceId,
      allowedRevisions:[IDENTITY.configRevision]});
    openRuntime();
  }
  function openRuntime(){
    edge=createEdgeRuntime({dir,identity:IDENTITY,sessionId:randomUUID(),
      probe:async id=>({...wan[id],reason:wan[id].upstream?"HEALTHY":"INJECTED_UNREACHABLE"}),
      applyRoute:async selected=>{route=selected;},
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
      identity:status.identity,network:status.network,storage:status.storage,
      runtimeHealth:status.runtimeHealth,volatilePending:status.volatilePending,
      droppedEvidence:status.droppedEvidence,lastError:status.lastError,
      routeAppliedInMemory:route,wans:Object.entries(wan).map(([id,w])=>({id,...w})),
      cloud:{...cloud.status(),available:cloudAvailable,
        connected:cloudAvailable&&status.network.selectedWan!==null},
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
          return emit("wan:"+body.id,{ok:true,injected:true,upstream:body.upstream,
            note:"Probe input updated; select Sample to reconcile route"});
        case "cloud":
          if(typeof body.available!=="boolean")throw Error("INVALID_LAB_CLOUD");
          cloudAvailable=body.available;
          return emit("cloud",{ok:true,available:cloudAvailable});
        case "sync":
          if(!cloudAvailable||edge.status().network.selectedWan===null)
            return emit("sync",{ok:false,status:"SYNC_INCOMPLETE",error:"CLOUD_UNAVAILABLE"});
          result=await edge.sync(cloud,16);
          return emit("sync",result);
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
    if(edge)edge.close();
    if(dir)fs.rmSync(dir,{recursive:true,force:true});
  }
  start();
  return {command,snapshot,close};
}
module.exports={createDashboardLab,CAPABILITIES};
