"use strict";
// Bounded W1.9.O mock Cloud. No mTLS, PKI or production trust validation.
const {validateIdentity,validateEnvelope,eventChecksum}=require("./event-envelope.js");
function createLabCloudReplica({siteId,deviceId,allowedRevisions}={}){
  const scope=validateIdentity({siteId,deviceId,configRevision:"lab-cloud"});
  const revisions=allowedRevisions===undefined?null:new Set(allowedRevisions);
  const stored=new Map();
  let lostAcks=0,forgedAcks=0;
  return {
    dropNextDurableAck(){lostAcks++;},
    forgeNextAck(){forgedAcks++;},
    async ingest(event){
      if(!event||!["O0","O1","O2","O3"].includes(event.category)||
         typeof event.sha256!=="string"||event.sha256!==eventChecksum(event))
        return {ok:false,durable:false,error:"INVALID_EVENT_CHECKSUM"};
      const env=validateEnvelope(event.payload,event.eventId);
      if(!env.ok)return {ok:false,durable:false,error:env.error};
      if(env.siteId!==scope.siteId||env.deviceId!==scope.deviceId)
        return {ok:false,durable:false,error:"DEVICE_SCOPE_MISMATCH"};
      if(revisions&&!revisions.has(env.configRevision))
        return {ok:false,durable:false,error:"CONFIG_REVISION_CONFLICT"};
      const old=stored.get(event.eventId);
      if(old&&old!==event.sha256)return {ok:false,durable:false,error:"EVENT_ID_CONFLICT"};
      const duplicate=Boolean(old);
      if(!old)stored.set(event.eventId,event.sha256);
      if(lostAcks){lostAcks--;return {ok:false,durable:false,error:"REMOTE_ACK_LOST",remoteCommitted:true};}
      if(forgedAcks){forgedAcks--;return {ok:true,durable:true,eventId:"forged-event",
        sha256:event.sha256,siteId:scope.siteId,deviceId:scope.deviceId,duplicate};}
      return {ok:true,durable:true,eventId:event.eventId,sha256:event.sha256,
        siteId:scope.siteId,deviceId:scope.deviceId,duplicate};
    },
    status(){return {stored:stored.size,siteId:scope.siteId,deviceId:scope.deviceId,
      simulated:true,authenticated:false};}
  };
}
async function syncJournal({journal,transport,maxEvents=16}={}){
  if(!journal||typeof journal.pending!=="function"||typeof journal.cloudAck!=="function"||
     !transport||typeof transport.ingest!=="function")throw Error("INVALID_SYNC_PORT");
  if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>256)throw Error("INVALID_SYNC_BOUND");
  const batch=journal.pending().slice(0,maxEvents);
  let uploaded=0,duplicates=0,acked=0,error=null;
  for(const event of batch){
    let response;
    try{response=await transport.ingest(event);}
    catch{error="REMOTE_TRANSPORT_ERROR";break;}
    if(!(response&&response.ok===true&&response.durable===true&&
      response.eventId===event.eventId&&response.sha256===event.sha256&&
      response.siteId===event.payload?.siteId&&response.deviceId===event.payload?.deviceId)){
      error=response?.error||"INVALID_REMOTE_ACK";break;
    }
    const cursor=journal.cloudAck(event.eventId);
    if(cursor.ack!==true){error=cursor.error||"LOCAL_CURSOR_NOT_DURABLE";break;}
    acked++;if(response.duplicate)duplicates++;else uploaded++;
  }
  return {kind:"PEF_LAB_CLOUD_REPLAY",status:error?"SYNC_INCOMPLETE":"SYNC_OK",
    uploaded,duplicates,acked,error,attempted:batch.length,remaining:journal.pending().length,
    scope:"Mock transport, no remote cryptographic authentication",deviceValidated:false};
}
module.exports={createLabCloudReplica,syncJournal};
