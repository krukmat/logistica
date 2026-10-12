"use strict";
// Idempotent local-only logistics receiving workflow backed by the shared fsync journal.
const {validateIdentity,RECEIPT,PACKAGE}=require("./event-envelope.js");
function createLocalReceipts({journal,identity}={}){
  const scope=validateIdentity(identity);
  if(!journal||typeof journal.append!=="function"||typeof journal.retained!=="function")
    throw Error("RECEIPTS_JOURNAL_REQUIRED");
  function list(){
    return journal.retained().filter(e=>e.category==="O1"&&
      e.payload?.eventType==="RECEIPT_REGISTERED").map(e=>({
        receiptId:e.payload.receiptId,packageId:e.payload.packageId,status:"RECEIVED",
        eventId:e.eventId,cloudAcked:e.cloudAcked,fsyncRecorded:true
      }));
  }
  function receive({receiptId,packageId}={}){
    if(typeof receiptId!=="string"||!RECEIPT.test(receiptId)||
       typeof packageId!=="string"||!PACKAGE.test(packageId))
      return {ok:false,accepted:false,error:"INVALID_RECEIPT_INPUT"};
    const eventId="receipt."+scope.deviceId+"."+receiptId;
    const payload={schemaVersion:1,...scope,eventType:"RECEIPT_REGISTERED",
      eventId,correlationId:eventId,receiptId,packageId,
      packageStatus:"RECEIVED",localOnlyCapable:true};
    const result=journal.append({eventId,category:"O1",payload});
    if(!(result.ack===true&&(result.fsyncCompleted===true||result.duplicate===true)))
      return {ok:false,accepted:false,error:result.error||"JOURNAL_DURABILITY_UNCONFIRMED",eventId,
      localOnlyCapable:true,fsyncCompleted:false,physicalPowerCutValidated:false};
    return {ok:true,accepted:true,duplicate:Boolean(result.duplicate),eventId,
      receiptId,packageId,status:"RECEIVED",fsyncCompleted:Boolean(result.fsyncCompleted),
      localOnlyCapable:true,physicalPowerCutValidated:false};
  }
  return {receive,list};
}
module.exports={createLocalReceipts};
