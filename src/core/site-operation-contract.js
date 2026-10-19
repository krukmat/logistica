"use strict";
// Single vertical operation vocabulary and envelope grammar. No filesystem, OS or process dependencies.
// Property event bytes/identifiers from M4.1 remain backward-compatible.
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
const SCOPE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;
const REV=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SCHEMAS=Object.freeze({
  property:Object.freeze({open:"ALERT",openEvent:"PROPERTY_ALERT_RAISED",
    ackEvent:"PROPERTY_ALERT_ACKED",openSuffix:"alert",
    fields:Object.freeze(["assetId","severity"]),error:"INVALID_PROPERTY_COMMAND",
    missing:"PROPERTY_ALERT_NOT_FOUND"}),
  host:Object.freeze({open:"OPEN",openEvent:"HOST_INCIDENT_OPENED",
    ackEvent:"HOST_INCIDENT_ACKED",openSuffix:"open",
    fields:Object.freeze(["unitId","category","severity"]),error:"INVALID_HOST_COMMAND",
    missing:"HOST_INCIDENT_NOT_FOUND"})
});
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
function validateSiteCommand(profile,command){
  const rule=SCHEMAS[profile];
  if(!rule)return {ok:false,error:"UNKNOWN_SITE_PROFILE"};
  if(!command||!ID.test(command.incidentId||""))return {ok:false,error:rule.error};
  if(exact(command,["operation","incidentId"])&&command.operation==="ACK")return {ok:true};
  const names=["operation","incidentId",...rule.fields];
  if(!exact(command,names)||command.operation!==rule.open||
     !["WARNING","CRITICAL"].includes(command.severity))return {ok:false,error:rule.error};
  if(profile==="property"&&!ID.test(command.assetId||""))return {ok:false,error:rule.error};
  if(profile==="host"&&(!ID.test(command.unitId||"")||
       !["MAINTENANCE","SAFETY"].includes(command.category)))return {ok:false,error:rule.error};
  return {ok:true};
}
function eventRule(eventType){
  for(const [profile,rule] of Object.entries(SCHEMAS)){
    if(eventType===rule.openEvent)return {profile,rule,isOpen:true};
    if(eventType===rule.ackEvent)return {profile,rule,isOpen:false};
  }
  return null;
}
function validateSiteEnvelope(payload,eventId){
  const found=eventRule(payload?.eventType);
  if(!found)return null;
  const {profile,rule,isOpen}=found;
  const base=profile+"."+payload.deviceId+"."+payload.incidentId;
  const initial= isOpen?rule.openSuffix:"ack";
  const command=isOpen?{operation:rule.open,incidentId:payload.incidentId,
    ...(profile==="property"?{assetId:payload.assetId,severity:payload.severity}:
      {unitId:payload.unitId,category:payload.category,severity:payload.severity})}:
    {operation:"ACK",incidentId:payload.incidentId};
  const valid=payload.schemaVersion===1&&SCOPE.test(payload.siteId||"")&&
    SCOPE.test(payload.deviceId||"")&&REV.test(payload.configRevision||"")&&
    payload.localOnlyCapable===true&&payload.eventId===eventId&&
    payload.correlationId===base&&eventId===base+"."+initial&&
    (isOpen?true:rule.fields.every(field=>payload[field]===undefined))&&
    validateSiteCommand(profile,command).ok===true;
  if(!valid)return {ok:false,error:profile==="host"?"INVALID_HOST_ENVELOPE":"INVALID_PROPERTY_ENVELOPE"};
  return {ok:true,siteId:payload.siteId,deviceId:payload.deviceId,
    configRevision:payload.configRevision,eventType:payload.eventType};
}
module.exports={SCHEMAS,validateSiteCommand,validateSiteEnvelope};
