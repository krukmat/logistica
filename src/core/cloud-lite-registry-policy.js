"use strict";
// M6.1 portable registry policy. IO/entropy/constant-time credential checks are adapters.
const {validateIdentity}=require("./event-envelope.js");
const MAX_DEVICES=128;
function checkedIdentity(input){
  if(!input||typeof input!=="object"||Array.isArray(input)||
     Object.keys(input).sort().join(",")!=="configRevision,deviceId,siteId")
    throw Error("CLOUD_LITE_INVALID_IDENTITY_FIELDS");
  try{return validateIdentity(input);}catch{throw Error("CLOUD_LITE_INVALID_IDENTITY");}
}
const keyOf=x=>x.siteId+"/"+x.deviceId;
function planEnroll(devices,input){
  const scope=checkedIdentity(input);
  if(!Array.isArray(devices))throw Error("CLOUD_LITE_INVALID_REGISTRY");
  if(devices.some(x=>keyOf(x)===keyOf(scope)))
    return {ok:false,error:"DEVICE_ALREADY_ENROLLED"};
  if(devices.length>=MAX_DEVICES)return {ok:false,error:"REGISTRY_CAPACITY_REACHED"};
  return {ok:true,scope};
}
function findRegistered(devices,input){
  const scope=checkedIdentity(input);
  const item=devices.find(x=>keyOf(x)===keyOf(scope));
  if(!item||item.configRevision!==scope.configRevision)return null;
  return item;
}
module.exports={checkedIdentity,planEnroll,findRegistered,MAX_DEVICES,keyOf};
