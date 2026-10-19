"use strict";
// Portable proof contract. No filesystem or entropy in Core.
const {validateIdentity}=require("./event-envelope.js");
const NONCE=/^[a-f0-9]{32,128}$/;
function frame(identity,nonce){
 const scope=validateIdentity(identity);
 if(typeof nonce!=="string"||!NONCE.test(nonce))throw Error("M71_NONCE_INVALID");
 return Buffer.from(JSON.stringify(["PEF-M7-DEVICE-CHALLENGE-V1",
   scope.siteId,scope.deviceId,scope.configRevision,nonce]),"utf8");
}
function sameScope(a,b){
 return a?.siteId===b?.siteId&&a?.deviceId===b?.deviceId&&
   a?.configRevision===b?.configRevision;
}
module.exports={frame,sameScope};
