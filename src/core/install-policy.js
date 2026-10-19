"use strict";
// Portable PEF M5 software-release state machine. NO filesystem or host command operations.
const VERSION=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$/;
function validVersion(v){return typeof v==="string"&&VERSION.test(v)&&v!=="."&&v!=="..";}
function nextInstallState(current,version,hash,mode){
  if(!validVersion(version)||!/^[a-f0-9]{64}$/.test(hash))throw Error("M5_INVALID_RELEASE");
  if(!["install","upgrade","rollback"].includes(mode))throw Error("M5_INVALID_ACTION");
  if(mode==="install"&&current)throw Error("M5_ALREADY_INSTALLED");
  if(mode==="upgrade"&&!current)throw Error("M5_NOT_INSTALLED");
  if(mode==="rollback"&&(!current||current.previousVersion!==version))
    throw Error("M5_ROLLBACK_TARGET_DENIED");
  if(current?.activeVersion===version){
    if(current.activeHash!==hash)throw Error("M5_VERSION_IMMUTABLE");
    return {state:current,changed:false};
  }
  return {state:{schemaVersion:1,kind:"PEF_M5_LAB_INSTALL_STATE",
    activeVersion:version,activeHash:hash,
    previousVersion:current?.activeVersion||null,previousHash:current?.activeHash||null,
    physicalValidated:false,systemServiceInstalled:false,bootPersistenceValidated:false},
    changed:true};
}
module.exports={validVersion,nextInstallState};
