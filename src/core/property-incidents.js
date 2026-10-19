"use strict";
// Property overlay domain: immutable local events on the existing PEF journal.
const {validateIdentity}=require("./event-envelope.js");
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
const exactly=(v,names)=>v&&typeof v==="object"&&!Array.isArray(v)&&
  Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
function validatePropertyCommand(command){
  if(exactly(command,["operation","incidentId","assetId","severity"])&&
    command.operation==="ALERT"&&ID.test(command.incidentId)&&ID.test(command.assetId)&&
    ["WARNING","CRITICAL"].includes(command.severity))return {ok:true};
  if(exactly(command,["operation","incidentId"])&&command.operation==="ACK"&&ID.test(command.incidentId))
    return {ok:true};
  return {ok:false,error:"INVALID_PROPERTY_COMMAND"};
}
function createPropertyIncidents({journal,identity}={}){
  const scope=validateIdentity(identity);
  if(!journal||typeof journal.append!=="function"||typeof journal.retained!=="function")
    throw Error("PROPERTY_JOURNAL_REQUIRED");
  const prefix=id=>"property."+scope.deviceId+"."+id;
  function list(){
    const incidents=new Map();
    for(const row of journal.retained()){
      const p=row.payload;
      if(row.category!=="O1"||p?.deviceId!==scope.deviceId||p?.siteId!==scope.siteId)continue;
      if(p.eventType==="PROPERTY_ALERT_RAISED"&&ID.test(p.incidentId)&&
         row.eventId===prefix(p.incidentId)+".alert"){
        incidents.set(p.incidentId,{incidentId:p.incidentId,assetId:p.assetId,
          severity:p.severity,status:"OPEN",alertEventId:row.eventId,
          cloudAcked:row.cloudAcked,fsyncRecorded:true});
      }else if(p.eventType==="PROPERTY_ALERT_ACKED"&&ID.test(p.incidentId)&&
         row.eventId===prefix(p.incidentId)+".ack"){
        const entry=incidents.get(p.incidentId);
        if(entry){entry.status="ACKNOWLEDGED";entry.ackEventId=row.eventId;entry.ackCloudAcked=row.cloudAcked;}
      }
    }
    return [...incidents.values()];
  }
  function apply(command){
    const valid=validatePropertyCommand(command);
    if(!valid.ok)return {...valid,accepted:false};
    const base=prefix(command.incidentId);
    if(command.operation==="ACK"&&!list().some(x=>x.incidentId===command.incidentId))
      return {ok:false,accepted:false,error:"PROPERTY_ALERT_NOT_FOUND"};
    const isAlert=command.operation==="ALERT";
    const eventId=base+(isAlert?".alert":".ack");
    const payload={schemaVersion:1,...scope,
      eventType:isAlert?"PROPERTY_ALERT_RAISED":"PROPERTY_ALERT_ACKED",
      eventId,correlationId:base,incidentId:command.incidentId,
      ...(isAlert?{assetId:command.assetId,severity:command.severity}:{}),
      localOnlyCapable:true};
    const result=journal.append({eventId,category:"O1",payload});
    if(!(result.ack===true&&(result.fsyncCompleted===true||result.duplicate===true)))
      return {ok:false,accepted:false,eventId,error:result.error||"JOURNAL_DURABILITY_UNCONFIRMED",
        fsyncCompleted:false,physicalPowerCutValidated:false};
    return {ok:true,accepted:true,duplicate:Boolean(result.duplicate),eventId,
      incidentId:command.incidentId,status:isAlert?"OPEN":"ACKNOWLEDGED",
      fsyncCompleted:Boolean(result.fsyncCompleted),physicalPowerCutValidated:false,
      localOnlyCapable:true};
  }
  return {apply,list};
}
module.exports={createPropertyIncidents,validatePropertyCommand};
