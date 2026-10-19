"use strict";
// One journal-backed operation engine; profiles are declarative contracts, not forks of Core.
const {validateIdentity}=require("./event-envelope.js");
const {SCHEMAS,validateSiteCommand}=require("./site-operation-contract.js");
function createSiteOperations({profile,journal,identity}={}){
  const scope=validateIdentity(identity),rule=SCHEMAS[profile];
  if(!rule)throw Error("UNKNOWN_SITE_PROFILE");
  if(!journal||typeof journal.append!=="function"||typeof journal.retained!=="function")
    throw Error("SITE_OPERATIONS_JOURNAL_REQUIRED");
  const prefix=id=>profile+"."+scope.deviceId+"."+id;
  function list(){
    const incidents=new Map();
    for(const row of journal.retained()){
      const p=row.payload;
      if(row.category!=="O1"||p?.deviceId!==scope.deviceId||p?.siteId!==scope.siteId)continue;
      if(p.eventType===rule.openEvent&&row.eventId===prefix(p.incidentId)+"."+rule.openSuffix){
        const item={incidentId:p.incidentId,
          ...(profile==="property"?{assetId:p.assetId}:{unitId:p.unitId,category:p.category}),
          severity:p.severity,status:"OPEN",alertEventId:row.eventId,
          cloudAcked:row.cloudAcked,fsyncRecorded:true};
        incidents.set(p.incidentId,item);
      }else if(p.eventType===rule.ackEvent&&row.eventId===prefix(p.incidentId)+".ack"){
        const item=incidents.get(p.incidentId);
        if(item){item.status="ACKNOWLEDGED";item.ackEventId=row.eventId;item.ackCloudAcked=row.cloudAcked;}
      }
    }
    return [...incidents.values()];
  }
  function apply(command){
    const valid=validateSiteCommand(profile,command);
    if(!valid.ok)return {...valid,accepted:false};
    const base=prefix(command.incidentId),isOpen=command.operation===rule.open;
    if(!isOpen&&!list().some(x=>x.incidentId===command.incidentId))
      return {ok:false,accepted:false,error:rule.missing};
    const eventId=base+"."+(isOpen?rule.openSuffix:"ack");
    const payload={schemaVersion:1,...scope,eventType:isOpen?rule.openEvent:rule.ackEvent,
      eventId,correlationId:base,incidentId:command.incidentId,
      ...(isOpen?(profile==="property"?{assetId:command.assetId,severity:command.severity}:
        {unitId:command.unitId,category:command.category,severity:command.severity}):{}),
      localOnlyCapable:true};
    const result=journal.append({eventId,category:"O1",payload});
    if(!(result.ack===true&&(result.fsyncCompleted===true||result.duplicate===true)))
      return {ok:false,accepted:false,eventId,error:result.error||"JOURNAL_DURABILITY_UNCONFIRMED",
        fsyncCompleted:false,physicalPowerCutValidated:false};
    return {ok:true,accepted:true,duplicate:Boolean(result.duplicate),eventId,
      incidentId:command.incidentId,status:isOpen?"OPEN":"ACKNOWLEDGED",
      fsyncCompleted:Boolean(result.fsyncCompleted),physicalPowerCutValidated:false,localOnlyCapable:true};
  }
  return {apply,list};
}
module.exports={createSiteOperations};
