"use strict";
// W1.9.P2: mock proof wire contract with deterministic canonical tuple and ephemeral in-memory key.
// This does NOT establish device identity, certificate validation, TLS or production trust.
const {createHmac,timingSafeEqual}=require("node:crypto");
const VERSION=1;
function assertKey(key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error("INVALID_LAB_PROOF_KEY");
}
function ackBytes(ack){
  if(!ack||ack.protocolVersion!==VERSION||
     typeof ack.eventId!=="string"||typeof ack.sha256!=="string"||
     typeof ack.siteId!=="string"||typeof ack.deviceId!=="string"||
     typeof ack.duplicate!=="boolean")throw Error("INVALID_LAB_ACK_FRAME");
  // Fixed-order tuple avoids arbitrary JSON object key ordering for this small lab ACK only.
  return Buffer.from(JSON.stringify(["PEF-LAB-ACK",VERSION,ack.eventId,
    ack.sha256,ack.siteId,ack.deviceId,ack.duplicate]),"utf8");
}
function signLabAck(ack,key){assertKey(key);return createHmac("sha256",key).update(ackBytes(ack)).digest("hex");}
function verifyLabAck(ack,key){
  try{
    const provided=ack?.labProof;
    if(typeof provided!=="string"||!(/^[a-f0-9]{64}$/).test(provided))return false;
    const expected=Buffer.from(signLabAck(ack,key),"hex");
    return timingSafeEqual(expected,Buffer.from(provided,"hex"));
  }catch{return false;}
}
module.exports={VERSION,ackBytes,signLabAck,verifyLabAck};
