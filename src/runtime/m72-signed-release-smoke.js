"use strict";
// Genuine M5 installer under a pinned Ed25519 trust root, with a running packaged Edge.
// Test signer ephemeral; private authority key is NEVER persisted by the installer.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {generateKeyPairSync,randomBytes}=require("node:crypto");
const {applyRelease,verifyInstall,hashEntries,collect}=require("./m5-install.js");
const {boot,halt}=require("./m5-install-smoke.js");
const {provisionM72Trust,signM72Permit}=require("../adapters/m72-trust-anchor.js");
const {applySignedUpgradeWithHealth}=require("./m72-signed-upgrade.js");
async function runM72SignedReleaseSmoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m72-trusted-"));
 const {privateKey,publicKey}=generateKeyPairSync("ed25519",{
  privateKeyEncoding:{type:"pkcs8",format:"pem"},
  publicKeyEncoding:{type:"spki",format:"pem"}});
 const checks={};let child=null;let evidence=null;
 const digest=hashEntries(collect()),edgeToken=randomBytes(32).toString("hex");
 const configFile=path.join(root,"edge.json");
 const config={schemaVersion:1,backend:"virtual-lab",identity:{
  siteId:"m72-property",deviceId:"m72-edge",configRevision:"r1"},
  storageDir:path.join(root,"data"),http:{host:"127.0.0.1",port:0},
  sampleIntervalMs:250,workload:{enabled:true,profile:"property",reconcileMs:200},
  journal:{capacityBytes:65536,controlReserveBytes:4096},
  wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
 const api=async(url,route,body)=>{
  const response=await fetch(url+route,{method:body?"POST":"GET",
   headers:{"x-pef-token":edgeToken,...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:response.status,...await response.json()};
 };
 const authorized=(trust,{version,mode,ordinal,sequence,
  previousVersion=null,previousDigest=null,previousOrdinal=0,floorOrdinal=0})=>
  signM72Permit({kind:"PEF_M72_SIGNED_ACTIVATION_V1",rootId:trust.rootId,
   version,mode,digest,ordinal,sequence,previousVersion,previousDigest,
   previousOrdinal,floorOrdinal},privateKey);
 try{
  const trust=provisionM72Trust(root,publicKey);
  checks.TRUST_ANCHOR_CREATED=/^[a-f0-9]{64}$/.test(trust.keyId);
  let noSig=false;
  try{applyRelease({root,version:"v1",mode:"install"});}
  catch(e){noSig=e.message==="M72_SIGNATURE_REQUIRED";}
  checks.UNSIGNED_INSTALL_DENIED=noSig;
  const one=authorized(trust,{version:"v1",mode:"install",ordinal:1,sequence:1});
  const first=applyRelease({root,version:"v1",mode:"install",authorization:one});
  checks.SIGNED_INSTALL_VERIFIED=first.activeVersion==="v1"&&
   verifyInstall(root).status==="LAB_PASS";
  fs.writeFileSync(configFile,JSON.stringify(config)+"\n",{mode:0o600});
  let running=await boot(first.releaseDir,configFile,edgeToken);child=running.child;
  const created=await api(running.url,"property/incidents",{
   operation:"ALERT",incidentId:"M72-1",assetId:"PUMP-01",severity:"WARNING"});
  const ack=await api(running.url,"property/incidents",{operation:"ACK",incidentId:"M72-1"});
  checks.PACKAGED_EDGE_DURABLE=created.http===201&&ack.http===201&&
   created.fsyncCompleted===true&&ack.fsyncCompleted===true;
  await halt(child);child=null;
  const two=authorized(trust,{version:"v2",mode:"upgrade",ordinal:2,sequence:2,
   previousVersion:"v1",previousDigest:digest,previousOrdinal:1,floorOrdinal:1});
  let forged=false;
  try{applyRelease({root,version:"v2",mode:"upgrade",authorization:{
    ...two,signature:"A".repeat(86)+"=="}});}
  catch(e){forged=e.message==="M72_SIGNATURE_REQUIRED";}
  checks.FORGED_SIGNATURE_DENIED=forged;
  let incomplete=false;
  try{applyRelease({root,version:"v2",mode:"upgrade",authorization:two,
   interruptBeforeActivation:true});}
  catch(e){incomplete=e.message==="M5_INJECTED_BEFORE_ACTIVATION";}
  checks.INTERRUPTED_UPGRADE_SAFE=incomplete&&verifyInstall(root).activeVersion==="v1";
  let downgraded=false;
  try{applyRelease({root,version:"v2",mode:"upgrade",authorization:{
   ...two,ordinal:1,signature:two.signature}});}
  catch(e){downgraded=/M72_/.test(e.message);}
  checks.TAMPERED_ORDINAL_DENIED=downgraded;
  const rollback=authorized(trust,{version:"v1",mode:"rollback",ordinal:1,sequence:3,
   previousVersion:"v2",previousDigest:digest,previousOrdinal:2,floorOrdinal:2});
  let localBooted=false;
  const upgraded=await applySignedUpgradeWithHealth({root,version:"v2",
   upgradePermit:two,rollbackPermit:rollback,healthCheck:async installed=>{
    let probe=null;
    try{
     probe=await boot(installed.releaseDir,configFile,edgeToken);child=probe.child;
     const status=await api(probe.url,"state");
     localBooted=status.activeOverlay==="property"&&status.storage.unsafe===false;
     return false; // Deliberately fail a health gate after real daemon start.
    }finally{if(child){await halt(child);child=null;}}
   }});
  checks.SIGNED_HEALTH_FAILED_ROLLBACK=localBooted&&upgraded.rollback===true&&
   upgraded.activeVersion==="v1"&&verifyInstall(root).activeVersion==="v1";
  running=await boot(verifyInstall(root).releaseDir,configFile,edgeToken);child=running.child;
  const state=await api(running.url,"state");
  checks.ROLLBACK_JOURNAL_PRESERVED=state.propertyIncidents.some(x=>
   x.incidentId==="M72-1"&&x.status==="ACKNOWLEDGED");
  await halt(child);child=null;
  // No untrusted bypass even after fallback; previous state was signed.
  let noRollbackSig=false;
  try{applyRelease({root,version:"v2",mode:"rollback"});}
  catch(e){noRollbackSig=/M5_ROLLBACK_TARGET_DENIED|M72_SIGNATURE_REQUIRED/.test(e.message);}
  checks.LEGACY_BYPASS_DENIED=noRollbackSig;
  let downgrade=false;
  const bad=authorized(trust,{version:"v0",mode:"upgrade",ordinal:1,sequence:4,
   previousVersion:"v1",previousDigest:digest,previousOrdinal:1,floorOrdinal:2});
  try{applyRelease({root,version:"v0",mode:"upgrade",authorization:bad});}
  catch(e){downgrade=e.message==="M72_DOWNGRADE_DENIED";}
  checks.ANTI_DOWNGRADE_FLOOR=downgrade&&verifyInstall(root).activeVersion==="v1";
  const stateFile=path.join(root,"state.json");
  const old=fs.readFileSync(stateFile);
  const altered=JSON.parse(old);
  altered.secure.permit.signature="A".repeat(86)+"==";
  fs.writeFileSync(stateFile,JSON.stringify(altered)+"\n",{mode:0o600});
  let tampered=false;
  try{verifyInstall(root);}catch(e){tampered=e.message==="M72_ACTIVE_SIGNATURE_INVALID";}
  checks.SIGNED_STATE_TAMPER_DENIED=tampered;
  let bootRejected=false;
  try{
   const unexpected=await boot(path.join(root,"releases","v1"),configFile,edgeToken);
   await halt(unexpected.child);
  }catch(e){bootRejected=/M72_ACTIVE_SIGNATURE_INVALID/.test(e.message);}
  // The verifier must fail before a non-active or corrupted release is started.
  checks.SIGNED_STATE_BOOT_REJECTED=bootRejected;
  fs.writeFileSync(stateFile,old);
  checks.VERIFIED_AFTER_RESTORE=verifyInstall(root).ok===true;
  const ok=Object.values(checks).every(Boolean);
  evidence={kind:"PEF_M72_SIGNED_RELEASE_LAB_V1",status:ok?"LAB_PASS":"LAB_FAIL",
   ok,checks,publicTrustKeyId:trust.keyId,privateKeyInEvidence:false,
   signedVersion:"v1",upgradeAttempt:"v2",rollback:"AUTHORIZED_KNOWN_GOOD",
   healthFailure:"LAB_INJECTED_AFTER_REAL_PACKAGE_BOOT",
   secureBootValidated:false,productionOtaValidated:false,
   storageRollbackResistance:"SOFTWARE_STATE_ONLY_NOT_TPM",
   physicalPowerCutValidated:false,platform:process.platform,arch:process.arch};
  return evidence;
 }finally{
  if(child)await halt(child);
  fs.rmSync(root,{recursive:true,force:true});
 }
}
module.exports={runM72SignedReleaseSmoke};
