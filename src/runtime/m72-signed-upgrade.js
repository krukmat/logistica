"use strict";
// Explicit trusted health-probed upgrade; signer provides BOTH preauthorized permits.
// Never roll back to a previously untrusted release or synthesize an authorization.
const {applyRelease,verifyInstall}=require("./m5-install.js");
async function applySignedUpgradeWithHealth({root,version,upgradePermit,rollbackPermit,healthCheck}={}){
 if(typeof healthCheck!=="function")throw Error("M72_HEALTH_CHECK_REQUIRED");
 const prior=verifyInstall(root);
 const upgraded=applyRelease({root,version,mode:"upgrade",authorization:upgradePermit});
 let healthy=false;
 try{healthy=await healthCheck(upgraded)===true;}catch{healthy=false;}
 if(healthy)return {ok:true,status:"SIGNED_UPGRADE_HEALTHY",upgraded:upgraded.activeVersion,
  previous:prior.activeVersion,rollback:false,physicalValidated:false};
 if(!rollbackPermit)throw Error("M72_FAILED_HEALTH_NO_AUTHORIZED_ROLLBACK");
 const rolled=applyRelease({root,version:prior.activeVersion,mode:"rollback",
   authorization:rollbackPermit});
 if(rolled.activeVersion!==prior.activeVersion||rolled.digest!==prior.digest)
  throw Error("M72_ROLLBACK_INTEGRITY_FAILURE");
 return {ok:true,status:"SIGNED_UPGRADE_ROLLED_BACK",
  failedUpgradeVersion:version,activeVersion:rolled.activeVersion,
  rollback:true,healthCheckPassed:false,physicalValidated:false};
}
module.exports={applySignedUpgradeWithHealth};
