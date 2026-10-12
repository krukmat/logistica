"use strict";
// Approved development workload, no filesystem or network access required by its contract.
// NOTE: Plain Node subprocess is NOT a sandbox; Linux isolation is a separate gate.
const RECEIPT=/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
const PACKAGE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
process.on("message",m=>{
  if(!m||typeof m!=="object")return;
  if(m.type==="HEALTH")process.send?.({type:"REPLY",id:m.id,ok:true});
  else if(m.type==="RECEIPT"){
    const valid=typeof m.receiptId==="string"&&RECEIPT.test(m.receiptId)&&
      typeof m.packageId==="string"&&PACKAGE.test(m.packageId);
    process.send?.({type:"REPLY",id:m.id,ok:valid,error:valid?null:"INVALID_RECEIPT_INPUT"});
  }else if(m.type==="CRASH")process.exit(42);
});
process.send?.({type:"READY",id:"pef-receiver",pid:process.pid});
