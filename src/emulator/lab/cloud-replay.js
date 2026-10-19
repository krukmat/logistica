"use strict";
// Bounded W1.9.O mock Cloud. No mTLS, PKI or production trust validation.
const {validateIdentity,validateEnvelope,eventChecksum}=require("./event-envelope.js");
const {VERSION,signLabAck,verifyLabAck}=require("./transport-frame.js");
const {syncJournal}=require("../../core/cloud-sync.js");
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
      if(["RECEIPT_REGISTERED","PROPERTY_ALERT_RAISED","PROPERTY_ALERT_ACKED"].includes(env.eventType)&&event.category!=="O1")
        return {ok:false,durable:false,error:"INVALID_RECEIPT_CATEGORY"};
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
module.exports={createLabCloudReplica,syncJournal};
