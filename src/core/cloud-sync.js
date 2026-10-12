"use strict";
// Shared replay engine. Transport credentials, signed proofs and durable remote store are adapter responsibilities.
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
    if(!(cursor.ack===true&&(cursor.fsyncCompleted===true||cursor.duplicate===true))){
      error=cursor.error||"LOCAL_CURSOR_NOT_DURABLE";break;
    }
    acked++;if(response.duplicate)duplicates++;else uploaded++;
  }
  return {kind:"PEF_CLOUD_REPLAY",status:error?"SYNC_INCOMPLETE":"SYNC_OK",
    uploaded,duplicates,acked,error,attempts,timeoutMs,maxAttempts,
    attempted:batch.length,remaining:journal.pending().length,
    scope:"Authenticated transport not established by this engine",deviceValidated:false};
}
module.exports={syncJournal};
