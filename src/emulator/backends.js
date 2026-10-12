"use strict";
const {createSimulator}=require("./core.js");
// Capability negotiation boundary. Only sim is executable in this revision.
const BACKENDS=Object.freeze({
  "sim":Object.freeze({implemented:true,environment:"JS_LOGICAL",ports:["Clock","WanProbe","CloudTransport","Journal","WorkloadLimiter","RecoveryBoot"],physical:false}),
  "linux-lab":Object.freeze({implemented:false,environment:"LINUX_NAMESPACE_OR_VM",ports:[],physical:false}),
  "device":Object.freeze({implemented:false,environment:"INSTRUMENTED_PHYSICAL_DEVICE",ports:[],physical:true})
});
function openBackend(kind="sim",config={}){
  if(!Object.prototype.hasOwnProperty.call(BACKENDS,kind))return {ok:false,kind,error:"UNKNOWN_BACKEND"};
  const capabilities=BACKENDS[kind];
  if(!capabilities.implemented)return {ok:false,kind,error:"BACKEND_NOT_IMPLEMENTED",capabilities};
  return {ok:true,kind,capabilities,engine:createSimulator(config)};
}
module.exports={BACKENDS,openBackend};
