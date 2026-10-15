"use strict";
// W1.10.B3 ONLY: deterministic write/fsync errors against a temporary real file.
// This fixture is supplied by trusted test code; never configure from operator HTTP.
const fs=require("node:fs");
function createFaultableFileOps(base=fs){
 let fault=null,attempts=0;
 const fsOps=Object.create(base);
 const ioError=(code)=>Object.assign(Error("INJECTED_STORAGE_"+code),{code});
 fsOps.writeSync=(fd,buffer,offset,length,position)=>{
   attempts++;
   if(fault?.point==="write"){
     const f=fault;fault=null;
     if(f.mode==="enospc")throw ioError("ENOSPC");
     if(f.mode==="zero")return 0;
     if(f.mode==="partial"){
       const count=Math.max(1,Math.min(length-1,Math.floor(length/2)));
       base.writeSync(fd,buffer,offset,count,position);
       throw ioError("ENOSPC");
     }
   }
   return base.writeSync(fd,buffer,offset,length,position);
 };
 fsOps.fsyncSync=fd=>{
   if(fault?.point==="fsync"){
     fault=null;throw ioError("EIO");
   }
   return base.fsyncSync(fd);
 };
 function failNextWrite(mode="enospc"){
   if(fault)throw Error("STORAGE_FAULT_ALREADY_ARMED");
   if(!["enospc","partial","zero"].includes(mode))throw Error("INVALID_STORAGE_FAULT");
   fault={point:"write",mode};
 }
 function failNextFsync(){
   if(fault)throw Error("STORAGE_FAULT_ALREADY_ARMED");
   fault={point:"fsync"};
 }
 return {fsOps,failNextWrite,failNextFsync,snapshot:()=>({faultArmed:Boolean(fault),writeAttempts:attempts,hostDiskExhausted:false,physicalPowerCutValidated:false})};
}
module.exports={createFaultableFileOps};
