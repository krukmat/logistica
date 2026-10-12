"use strict";
// Lab-only integration slice: actual host-fsync journal + pluggable WAN policy.
// The route/probe adapters are injected, never executed as shell commands here.
const {randomUUID}=require("node:crypto");
const {createConnectivityController}=require("./netns-policy.js");
const {createFileJournal}=require("./file-journal.js");
const {syncJournal}=require("./cloud-replay.js");
const {validateIdentity,EPOCH}=require("./event-envelope.js");
const {createLocalReceipts}=require("./local-receipts.js");
function createEdgeRuntime({dir,probe,applyRoute,simulatorOptions={},journalOptions={},
                           sessionId=randomUUID(),identity,maxVolatileEvents=8}={}){
  const stable=validateIdentity(identity);
  if(typeof probe!=="function"||typeof applyRoute!=="function")throw Error("INVALID_EDGE_PORT");
  if(typeof sessionId!=="string"||!EPOCH.test(sessionId))throw Error("INVALID_SESSION_ID");
  if(!Number.isSafeInteger(maxVolatileEvents)||maxVolatileEvents<1||maxVolatileEvents>4096)throw Error("INVALID_VOLATILE_BOUND");
  const journal=createFileJournal({dir,...journalOptions});
  const controller=createConnectivityController({probe,applyRoute,simulatorOptions});
  const receipts=createLocalReceipts({journal,identity:stable});
  const deferred=[];
  let sequence=0,closed=false,busy=false,last=null,droppedEvidence=0,lastError=null;
  function check(){if(closed)throw Error("EDGE_RUNTIME_CLOSED");}
  function appendOrDefer(event){
    const result=journal.append(event);
    if(result.ack)return {eventId:event.eventId,ack:true,fsyncCompleted:Boolean(result.fsyncCompleted),error:null};
    if(deferred.length<maxVolatileEvents)deferred.push(event);
    else droppedEvidence++;
    lastError=result.error||"STORAGE_UNSAFE";
    return {eventId:event.eventId,ack:false,error:lastError,volatileOnly:true,
      volatilePending:deferred.length,droppedEvidence};
  }
  function retryPending(){
    while(deferred.length){
      const item=deferred[0];
      const result=journal.append(item);
      if(!result.ack){lastError=result.error||"STORAGE_UNSAFE";return false;}
      deferred.shift();
    }
    lastError=null;
    return true;
  }
  function status(){
    check();
    const network=controller.status(),storage=journal.status();
    return {kind:"PEF_INTEGRATED_LOCAL_LAB",network,storage,
      runtimeHealth:storage.unsafe||deferred.length||droppedEvidence?"DEGRADED":"HEALTHY",
      identity:{...stable,sessionId},
      volatilePending:deferred.length,droppedEvidence,lastError,
      physicalWanValidated:false,physicalPowerCutValidated:false};
  }
  async function sample(seconds=1){
    check();
    if(busy)throw Error("EDGE_RUNTIME_BUSY");
    busy=true;
    try{
      // The real routing adapter must finish successfully before any event claims applied route.
      const observed=await controller.sample(seconds);
      const changed=last===null||last.selectedWan!==observed.selectedWan||
        last.connectivity!==observed.connectivity;
      last={selectedWan:observed.selectedWan,connectivity:observed.connectivity};
      retryPending(); // older events are retried before new transitions
      let event=null;
      if(changed){
        const eventId="wan."+stable.deviceId+"."+sessionId+"."+(++sequence);
        const critical=observed.connectivity==="LOCAL_ONLY"||
          (last&&observed.selectedWan==="backup");
        const payload={schemaVersion:1,...stable,sessionId,eventId,
          correlationId:eventId,logicalTime:observed.logicalTime,
          selectedWan:observed.selectedWan,connectivity:observed.connectivity,
          health:observed.health,appliedToAdapter:true,
          probes:observed.probes.map(p=>({wan:p.wan,link:p.link,upstream:p.upstream}))};
        event=appendOrDefer({eventId,category:critical?"O1":"O2",payload});
      }
      return {kind:"PEF_INTEGRATED_LOCAL_LAB_STEP",observed,event,...status()};
    }finally{busy=false;}
  }
  function pending(max=20){check();if(!Number.isSafeInteger(max)||max<1||max>256)throw Error("INVALID_PENDING_BOUND");
    return journal.pending().slice(0,max);}
  async function sync(transport,maxEvents=16,options={}){
    check();if(busy)throw Error("EDGE_RUNTIME_BUSY");busy=true;
    try{return await syncJournal({journal,transport,maxEvents,...options});}finally{busy=false;}
  }
  function receivePackage(input){
    check();if(busy)throw Error("EDGE_RUNTIME_BUSY");
    return receipts.receive(input);
  }
  function listReceipts(){check();return receipts.list();}
  function cloudAck(eventId){check();return journal.cloudAck(eventId);}
  function compact(options){check();return journal.compact(options);}
  function close(){if(closed)return;closed=true;journal.close();}
  return {sample,status,cloudAck,compact,pending,sync,receivePackage,listReceipts,close,controllerTrace:()=>controller.trace(),
    journalPath:journal.file,observations:()=>controller.observations()};
}
module.exports={createEdgeRuntime};
