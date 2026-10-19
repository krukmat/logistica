"use strict";
const {createHash}=require("node:crypto");
const {validateSiteEnvelope}=require("./site-operation-contract.js");
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;
const EPOCH=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REV=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function validateIdentity(value){
  if(!value||typeof value!=="object"||!ID.test(value.siteId||"")||
    !ID.test(value.deviceId||"")||!REV.test(value.configRevision||""))
    throw Error("LAB_IDENTITY_REQUIRED");
  return {siteId:value.siteId,deviceId:value.deviceId,configRevision:value.configRevision};
}
const RECEIPT=/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
const PACKAGE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
function validateEnvelope(payload,eventId){
  if(payload?.eventType==="RECEIPT_REGISTERED"){
    if(payload.schemaVersion!==1||!ID.test(payload.siteId||"")||
      !ID.test(payload.deviceId||"")||!REV.test(payload.configRevision||"")||
      !RECEIPT.test(payload.receiptId||"")||!PACKAGE.test(payload.packageId||"")||
      payload.packageStatus!=="RECEIVED"||payload.localOnlyCapable!==true||
      payload.eventId!==eventId||payload.correlationId!==eventId||
      eventId!=="receipt."+payload.deviceId+"."+payload.receiptId)
      return {ok:false,error:"INVALID_RECEIPT_ENVELOPE"};
    return {ok:true,siteId:payload.siteId,deviceId:payload.deviceId,
      configRevision:payload.configRevision,eventType:"RECEIPT_REGISTERED"};
  }
  const site=validateSiteEnvelope(payload,eventId);
  if(site!==null)return site;
  if(!payload||payload.schemaVersion!==1||!ID.test(payload.siteId||"")||
    !ID.test(payload.deviceId||"")||!EPOCH.test(payload.sessionId||"")||
    !REV.test(payload.configRevision||"")||typeof eventId!=="string"||
    payload.eventId!==eventId||payload.correlationId!==eventId||
    !Number.isFinite(payload.logicalTime)||payload.logicalTime<0||
    ![null,"primary","backup"].includes(payload.selectedWan)||
    !["LOCAL_ONLY","CONNECTED","MULTI_WAN_HEALTHY"].includes(payload.connectivity)||
    !["HEALTHY","DEGRADED"].includes(payload.health)||payload.appliedToAdapter!==true||
    !Array.isArray(payload.probes)||payload.probes.length!==2||
    new Set(payload.probes.map(p=>p.wan)).size!==2||
    payload.probes.some(p=>!p||!["primary","backup"].includes(p.wan)||
      typeof p.link!=="boolean"||typeof p.upstream!=="boolean"))
    return {ok:false,error:"INVALID_EVENT_ENVELOPE"};
  const expectedPrefix="wan."+payload.deviceId+"."+payload.sessionId+".";
  const seq=eventId.startsWith(expectedPrefix)?eventId.slice(expectedPrefix.length):"";
  if(!/^[1-9][0-9]*$/.test(seq)||eventId.length>160)
    return {ok:false,error:"EVENT_ID_SCOPE_MISMATCH"};
  return {ok:true,siteId:payload.siteId,deviceId:payload.deviceId,configRevision:payload.configRevision};
}
function eventChecksum(event){
  return createHash("sha256").update(JSON.stringify({
    kind:"EVENT",id:event.eventId,payload:event.payload,category:event.category
  })).digest("hex");
}
module.exports={validateIdentity,validateEnvelope,eventChecksum,EPOCH,RECEIPT,PACKAGE};
