"use strict";
// Pure policy; Ed25519 verification is performed by the trust adapter.
const {validVersion}=require("./install-policy.js");
const HEX=/^[a-f0-9]{64}$/;
function permitFrame(p){
 if(!p||p.kind!=="PEF_M72_SIGNED_ACTIVATION_V1"||
   !["install","upgrade","rollback"].includes(p.mode)||
   !validVersion(p.version)||!HEX.test(p.digest)||
   !Number.isSafeInteger(p.ordinal)||p.ordinal<1||p.ordinal>1000000000||
   !Number.isSafeInteger(p.sequence)||p.sequence<1||
   typeof p.rootId!=="string"||!HEX.test(p.rootId)||
   (p.previousVersion!==null&&!validVersion(p.previousVersion))||
   (p.previousDigest!==null&&!HEX.test(p.previousDigest))||
   !Number.isSafeInteger(p.previousOrdinal)||p.previousOrdinal<0||
   !Number.isSafeInteger(p.floorOrdinal)||p.floorOrdinal<0)
   throw Error("M72_PERMIT_SCHEMA_DENIED");
 return Buffer.from(JSON.stringify(["PEF-M72-ACTIVATION-V1",p.rootId,p.mode,
  p.version,p.digest,p.ordinal,p.sequence,p.previousVersion,
  p.previousDigest,p.previousOrdinal,p.floorOrdinal]));
}
function nextSecureState(current,permit,trustRootId){
 permitFrame(permit);
 if(permit.rootId!==trustRootId)throw Error("M72_FOREIGN_TRUST_ROOT");
 if(permit.sequence!==(current?.sequence||0)+1)throw Error("M72_SEQUENCE_ROLLBACK_DENIED");
 if(permit.previousVersion!==(current?.activeVersion||null)||
   permit.previousDigest!==(current?.activeHash||null)||
   permit.previousOrdinal!==(current?.ordinal||0)||
   permit.floorOrdinal!==(current?.floorOrdinal||0))
   throw Error("M72_STALE_TRANSITION");
 if(permit.mode==="install"&&current)throw Error("M72_ALREADY_INSTALLED");
 if(permit.mode!=="install"&&!current)throw Error("M72_NOT_INSTALLED");
 if(permit.mode==="upgrade"&&permit.ordinal<=current.floorOrdinal)
   throw Error("M72_DOWNGRADE_DENIED");
 if(permit.mode==="rollback"&&(!current||permit.version!==current.previousVersion||
   permit.digest!==current.previousHash||permit.ordinal!==current.previousReleaseOrdinal))
   throw Error("M72_ROLLBACK_NOT_KNOWN_GOOD");
 if(permit.mode==="rollback"&&!current.lastKnownGood)
   throw Error("M72_ROLLBACK_NOT_HEALTH_APPROVED");
 if(permit.mode==="install"&&permit.ordinal<1)throw Error("M72_ORDINAL_INVALID");
 return {sequence:permit.sequence,ordinal:permit.ordinal,
  floorOrdinal:Math.max(current?.floorOrdinal||0,permit.ordinal),
  previousReleaseOrdinal:current?.ordinal||0};
}
module.exports={permitFrame,nextSecureState};
