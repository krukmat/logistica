"use strict";
// Bounded W1.9.O mock Cloud. No mTLS, PKI or production trust validation.
const {validateIdentity,validateEnvelope,eventChecksum}=require("./event-envelope.js");
const {VERSION,signLabAck,verifyLabAck}=require("./transport-frame.js");
function createLabCloudReplica({siteId,deviceId,allowedRevisions,proofKey=null}={}){
  if(proofKey!==null&&(!Buffer.isBuffer(proofKey)||proofKey.length!==32))throw Error("INVALID_LAB_PROOF_KEY");
  const scope=validateIdentity({siteId,deviceId,configRevision:"lab-cloud"});
  const revisions=allowedRevisions===undefined?null:new Set(allowedRevisions);
  const stored=new Map();
  let lostAcks=0,forgedAcks=0,stalled=0,missingProof=0,badVersion=0;
  return {
    dropNextDurableAck(){lostAcks++;},
    forgeNextAck(){forgedAcks++;},
    stallNextIngest(){stalled++;},
    omitNextProof(){missingProof++;},
    useWrongVersionNext(){badVersion++;},
    verifyAck:(ack)=>proofKey===null?true:verifyLabAck(ack,proofKey),
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
      if(stalled){stalled--;return new Promise(()=>{});}
      if(lostAcks){lostAcks--;return {ok:false,durable:false,error:"REMOTE_ACK_LOST",remoteCommitted:true};}
      if(forgedAcks){forgedAcks--;return {ok:true,durable:true,eventId:"forged-event",
        sha256:event.sha256,siteId:scope.siteId,deviceId:scope.deviceId,duplicate};}
      const ack={ok:true,durable:true,eventId:event.eventId,sha256:event.sha256,
        siteId:scope.siteId,deviceId:scope.deviceId,duplicate};
      if(proofKey!==null){
        ack.protocolVersion=badVersion?VERSION+1:VERSION;
        if(badVersion)badVersion--;
        if(missingProof)missingProof--;
        else if(ack.protocolVersion===VERSION)ack.labProof=signLabAck(ack,proofKey);
      }
      return ack;
    },
    status(){return {stored:stored.size,siteId:scope.siteId,deviceId:scope.deviceId,
      simulated:true,authenticated:false,
      labProofEnabled:proofKey!==null,protocolVersion:proofKey!==null?VERSION:null};}
  };
}
function boundedIngest(transport,event,timeoutMs){
  return new Promise(resolve=>{
    let settled=false;
    const finish=(value)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>finish({error:"REMOTE_TIMEOUT"}),timeoutMs);
    Promise.resolve().then(()=>transport.ingest(event)).then(
      response=>finish({response}),
      ()=>finish({error:"REMOTE_TRANSPORT_ERROR"}));
  });
}
async function syncJournal({journal,transport,maxEvents=16,timeoutMs=250,maxAttempts=1}={}){
  if(!journal||typeof journal.pending!=="function"||typeof journal.cloudAck!=="function"||
     !transport||typeof transport.ingest!=="function")throw Error("INVALID_SYNC_PORT");
  if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>256)throw Error("INVALID_SYNC_BOUND");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>5000)throw Error("INVALID_SYNC_TIMEOUT");
  if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw Error("INVALID_RETRY_BOUND");
  const batch=journal.pending().slice(0,maxEvents);
  let uploaded=0,duplicates=0,acked=0,error=null,attempts=0;
  for(const event of batch){
    let response=null;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      attempts++;
      const outcome=await boundedIngest(transport,event,timeoutMs);
      if(outcome.error){
        error=outcome.error;
        if(attempt<maxAttempts)continue;
        break;
      }
      response=outcome.response;
      error=null;
      break;
    }
    if(error)break;
    if(!(response&&response.ok===true&&response.durable===true&&
      response.eventId===event.eventId&&response.sha256===event.sha256&&
      response.siteId===event.payload?.siteId&&response.deviceId===event.payload?.deviceId)){
      error=response?.error||"INVALID_REMOTE_ACK";break;
    }
    if(typeof transport.verifyAck==="function"&&!transport.verifyAck(response)){
      error="INVALID_REMOTE_PROOF";break;
    }
    const cursor=journal.cloudAck(event.eventId);
    if(cursor.ack!==true){error=cursor.error||"LOCAL_CURSOR_NOT_DURABLE";break;}
    acked++;if(response.duplicate)duplicates++;else uploaded++;
  }
  return {kind:"PEF_LAB_CLOUD_REPLAY",status:error?"SYNC_INCOMPLETE":"SYNC_OK",
    uploaded,duplicates,acked,error,attempts,timeoutMs,maxAttempts,
    attempted:batch.length,remaining:journal.pending().length,
    scope:"Mock transport, no remote cryptographic authentication",deviceValidated:false};
}
module.exports={createLabCloudReplica,syncJournal};
