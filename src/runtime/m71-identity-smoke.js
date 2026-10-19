"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {openM71SoftwareIdentity,verifyM71Proof}=require("../adapters/m71-identity-keystore.js");
async function runM71IdentitySmoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m71-identity-"));
 const scope={siteId:"m71-property-site",deviceId:"m71-edge-01",configRevision:"r1"};
 const checks={};let first;
 try{
  first=openM71SoftwareIdentity({dir:root,identity:scope});
  checks.PROVISIONED_ONCE=first.created===true&&first.hardwareBacked===false;
  const file=path.join(root,"pef-m71-identity-v1.json");
  checks.PRIVATE_KEY_PROTECTED=(fs.statSync(file).mode&0o077)===0;
  const nonce=randomBytes(32).toString("hex"),proof=first.prove(nonce);
  checks.SIGNED_CHALLENGE_VALID=verifyM71Proof(proof,scope,first.publicKeyPem,nonce);
  checks.WRONG_NONCE_DENIED=!verifyM71Proof(proof,scope,first.publicKeyPem,randomBytes(32).toString("hex"));
  checks.FOREIGN_SCOPE_DENIED=!verifyM71Proof(proof,{...scope,deviceId:"other"},first.publicKeyPem,nonce);
  checks.ALTERED_SIGNATURE_DENIED=!verifyM71Proof({...proof,signature:"A".repeat(86)+"=="},scope,first.publicKeyPem,nonce);
  const reopened=openM71SoftwareIdentity({dir:root,identity:scope});
  checks.REOPEN_PRESERVES_KEY=!reopened.created&&reopened.keyId===first.keyId&&
   verifyM71Proof(reopened.prove(nonce),scope,first.publicKeyPem,nonce);
  let mismatch=false;
  try{openM71SoftwareIdentity({dir:root,identity:{...scope,configRevision:"r2"}});}
  catch(e){mismatch=e.message==="M71_IDENTITY_MISMATCH";}
  checks.REVISION_CONFLICT_BLOCKED=mismatch;
  fs.writeFileSync(file,"{invalid\n",{mode:0o600});
  let corrupted=false;
  try{openM71SoftwareIdentity({dir:root,identity:scope});}
  catch(e){corrupted=e.message==="M71_IDENTITY_CORRUPT";}
  checks.CORRUPTION_FAIL_CLOSED=corrupted;
  return {kind:"PEF_M71_DEVICE_IDENTITY_LAB_V1",status:Object.values(checks).every(Boolean)?"LAB_PASS":"LAB_FAIL",
    ok:Object.values(checks).every(Boolean),checks,keyId:first.keyId,
    scope:"EPHEMERAL_SOFTWARE_ONLY",privateKeyInEvidence:false,
    persistedPrivateKey:true,provisioning:"CREATE_ONCE_FAIL_CLOSED",
    hardwareBacked:false,remoteTlsValidated:false,physicalValidated:false,
    platform:process.platform,arch:process.arch};
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
module.exports={runM71IdentitySmoke};
