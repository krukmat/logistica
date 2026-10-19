"use strict";
// M6.2 portable event validation; shared with Edge journal and protocol.
const {validateEnvelope,eventChecksum}=require("./event-envelope.js");
const RECEIPT_EVENTS=new Set(["RECEIPT_REGISTERED","PROPERTY_ALERT_RAISED",
 "PROPERTY_ALERT_ACKED","HOST_INCIDENT_OPENED","HOST_INCIDENT_ACKED"]);
function validateCloudLiteEvent(event){
 if(!event||typeof event!=="object"||Array.isArray(event)||
   !["O0","O1","O2","O3"].includes(event.category)||
   typeof event.eventId!=="string"||event.eventId.length>160||
   typeof event.sha256!=="string"||!/^[a-f0-9]{64}$/.test(event.sha256))
   return {ok:false,error:"CLOUD_LITE_INVALID_EVENT"};
 let envelope;
 try{envelope=validateEnvelope(event.payload,event.eventId);}
 catch{return {ok:false,error:"CLOUD_LITE_INVALID_ENVELOPE"};}
 if(!envelope.ok)return {ok:false,error:envelope.error};
 if(RECEIPT_EVENTS.has(envelope.eventType)&&event.category!=="O1")
   return {ok:false,error:"CLOUD_LITE_INVALID_CATEGORY"};
 if(event.sha256!==eventChecksum(event))
   return {ok:false,error:"CLOUD_LITE_EVENT_CHECKSUM"};
 return {ok:true,scope:{siteId:envelope.siteId,deviceId:envelope.deviceId,
    configRevision:envelope.configRevision}};
}
module.exports={validateCloudLiteEvent};
