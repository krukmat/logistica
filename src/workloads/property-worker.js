"use strict";
// Static allowlisted worker; stateless, no persistence or arbitrary execution.
const {validatePropertyCommand}=require("../core/property-incidents.js");
function reply(m,other){process.send?.({type:"REPLY",id:m.id,...other});}
process.on("message",m=>{
  if(!m||typeof m!=="object")return;
  if(m.type==="HEALTH")reply(m,{ok:true});
  else if(m.type==="PROPERTY")reply(m,validatePropertyCommand(m.input));
  else if(m.type==="CRASH"){reply(m,{ok:true});setImmediate(()=>process.exit(42));}
  else reply(m,{ok:false,error:"OPERATION_NOT_ALLOWED"});
});
process.send?.({type:"READY",id:"pef-property",pid:process.pid});
