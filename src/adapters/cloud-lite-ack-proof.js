"use strict";
// M6.3 lab ACK authenticity with device bearer secret. Not TLS, PKI or remote attestation.
const {createHmac,timingSafeEqual}=require("node:crypto");
const VERSION=1;
function frame(ack){
 if(!ack||ack.protocolVersion!==VERSION||
   typeof ack.eventId!=="string"||typeof ack.sha256!=="string"||
   typeof ack.siteId!=="string"||typeof ack.deviceId!=="string"||
   typeof ack.duplicate!=="boolean")
   throw Error("CLOUD_LITE_ACK_FRAME_INVALID");
 return Buffer.from(JSON.stringify(["PEF-CLOUD-LITE-ACK-V1",VERSION,ack.eventId,
   ack.sha256,ack.siteId,ack.deviceId,ack.duplicate]));
}
function key(token){
 if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token))
   throw Error("CLOUD_LITE_ACK_SECRET_INVALID");
 return Buffer.from(token,"hex");
}
function signCloudLiteAck(ack,token){
 return createHmac("sha256",key(token)).update(frame(ack)).digest("hex");
}
function verifyCloudLiteAck(ack,token){
 try{
  if(typeof ack?.labProof!=="string"||!/^[a-f0-9]{64}$/.test(ack.labProof))return false;
  const actual=Buffer.from(ack.labProof,"hex");
  const expected=Buffer.from(signCloudLiteAck(ack,token),"hex");
  return timingSafeEqual(actual,expected);
 }catch{return false;}
}
module.exports={VERSION,signCloudLiteAck,verifyCloudLiteAck};
