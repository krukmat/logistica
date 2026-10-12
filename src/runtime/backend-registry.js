"use strict";
// Runtime backend negotiation, deliberately separate from the synchronous scenario runner.
const {openEdgeService}=require("./edge-service.js");
const {openLinuxNetnsPorts}=require("../adapters/linux-netns-ports.js");
const RUNTIME_BACKENDS=Object.freeze({
  "virtual-lab":Object.freeze({available:true,physical:false,environment:"INJECTED_TEST_PORTS"}),
  "linux-lab":Object.freeze({available:true,physical:false,environment:"EPHEMERAL_GITHUB_NAMESPACE_ONLY"}),
  "device":Object.freeze({available:false,physical:true,environment:"PHYSICAL_DEVICE_NOT_IMPLEMENTED"})
});
function openRuntimeBackend(kind,{ports,ns,repoRoot,...serviceOptions}={}){
  if(!Object.hasOwn(RUNTIME_BACKENDS,kind))
    return {ok:false,kind,error:"UNKNOWN_BACKEND"};
  const capabilities=RUNTIME_BACKENDS[kind];
  if(!capabilities.available)
    return {ok:false,kind,error:"BACKEND_NOT_IMPLEMENTED",capabilities};
  let checkedPorts;
  try{
    checkedPorts=kind==="linux-lab"?openLinuxNetnsPorts({ns,repoRoot}):ports;
    if(!checkedPorts||typeof checkedPorts.probe!=="function"||
      typeof checkedPorts.applyRoute!=="function")
      throw Error("INVALID_SERVICE_PORTS");
    const engine=openEdgeService({...serviceOptions,ports:checkedPorts});
    return {ok:true,kind,capabilities,engine,ports:checkedPorts,
      hardwareValidated:false};
  }catch(e){
    return {ok:false,kind,error:String(e.message||e),capabilities,hardwareValidated:false};
  }
}
module.exports={RUNTIME_BACKENDS,openRuntimeBackend};
