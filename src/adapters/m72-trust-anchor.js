"use strict";
// Lab trust pin lives in M5 temporary install scope, NEVER stores a signer private key.
// The trust file cannot protect against privileged rollback of the entire filesystem.
const fs=require("node:fs"),path=require("node:path");
const {createPublicKey,createPrivateKey,createHash,randomBytes,sign,verify}=require("node:crypto");
const {permitFrame,nextSecureState}=require("../core/m72-signed-update-policy.js");
const FILE="pef-m72-trust-v1.json",HEX=/^[a-f0-9]{64}$/;
function fingerprint(pem){return createHash("sha256").update(
 createPublicKey(pem).export({type:"spki",format:"der"})).digest("hex");}
function readTrust(root){
 const f=path.join(root,FILE);
 if(!fs.existsSync(f))return null;
 const st=fs.lstatSync(f);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>4096)
   throw Error("M72_TRUST_FILE_UNSAFE");
 let doc;try{doc=JSON.parse(fs.readFileSync(f,"utf8"));}
 catch{throw Error("M72_TRUST_FILE_CORRUPT");}
 try{
  if(doc.kind!=="PEF_M72_TRUST_ANCHOR_V1"||!HEX.test(doc.rootId)||
   !HEX.test(doc.keyId)||typeof doc.publicKeyPem!=="string"||
   fingerprint(doc.publicKeyPem)!==doc.keyId||
   createPublicKey(doc.publicKeyPem).asymmetricKeyType!=="ed25519")
    throw Error("schema");
 }catch{throw Error("M72_TRUST_INVALID");}
 return doc;
}
function provisionM72Trust(rootInput,publicKeyPem){
 const {safeDir}=require("../runtime/m5-install.js");
 const root=safeDir(rootInput,{create:true});
 if(typeof publicKeyPem!=="string")throw Error("M72_PUBLIC_KEY_REQUIRED");
 let keyId;
 try{
  const key=createPublicKey(publicKeyPem);
  if(key.asymmetricKeyType!=="ed25519")throw Error("wrong-type");
  keyId=fingerprint(publicKeyPem);
 }catch{throw Error("M72_PUBLIC_KEY_INVALID");}
 const file=path.join(root,FILE);
 if(fs.existsSync(path.join(root,"state.json")))throw Error("M72_CANNOT_RETROFIT_EXISTING_INSTALL");
 let fd=null;
 try{
  fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|
   fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
  const trust={kind:"PEF_M72_TRUST_ANCHOR_V1",rootId:randomBytes(32).toString("hex"),
    keyId,publicKeyPem};
  fs.writeFileSync(fd,JSON.stringify(trust)+"\n");fs.fsyncSync(fd);
  fs.closeSync(fd);fd=null;
  const dirFd=fs.openSync(root,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
  try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
  return trust;
 }finally{if(fd!==null)fs.closeSync(fd);}
}
function signM72Permit(payload,privateKeyPem){
 const privateKey=createPrivateKey(privateKeyPem);
 if(privateKey.asymmetricKeyType!=="ed25519")throw Error("M72_SIGNER_KEY_INVALID");
 return {...payload,signature:sign(null,permitFrame(payload),privateKey).toString("base64")};
}
function verifyM72Permit(permit,publicKeyPem){
 try{
  if(!permit||typeof permit.signature!=="string"||
    !/^[A-Za-z0-9+/]{86}==$/.test(permit.signature))return false;
  return verify(null,permitFrame(permit),createPublicKey(publicKeyPem),
   Buffer.from(permit.signature,"base64"));
 }catch{return false;}
}
function guardSignedActivation({root,current,version,digest,mode,authorization}){
 const trust=readTrust(root);
 if(!trust){
  if(current?.secure)throw Error("M72_TRUST_ANCHOR_MISSING");
  if(authorization!==undefined)throw Error("M72_TRUST_NOT_PROVISIONED");
  return null;
 }
 if(!authorization||!verifyM72Permit(authorization,trust.publicKeyPem))
  throw Error("M72_SIGNATURE_REQUIRED");
 if(authorization.mode!==mode||authorization.version!==version||
    authorization.digest!==digest)throw Error("M72_ACTIVATION_TARGET_MISMATCH");
 const currentSecure=current?{
  ...current.secure,activeVersion:current.activeVersion,activeHash:current.activeHash,
  previousVersion:current.previousVersion,previousHash:current.previousHash
 }:null;
 const next=nextSecureState(currentSecure,authorization,trust.rootId);
 return {...next,permit:authorization,lastKnownGood:mode!=="upgrade",
  previousKnownGood:mode==="upgrade"?current?.secure?.lastKnownGood===true:false};
}
function verifySignedInstall(root,state){
 const trust=readTrust(root);
 if(!trust){
  if(state?.secure)throw Error("M72_TRUST_ANCHOR_MISSING");
  return;
 }
 if(!state) return;
 const sec=state.secure,p=sec?.permit;
 if(!p||!verifyM72Permit(p,trust.publicKeyPem)||
   p.rootId!==trust.rootId||p.version!==state.activeVersion||
   p.digest!==state.activeHash||p.sequence!==sec.sequence||
   p.ordinal!==sec.ordinal||p.floorOrdinal!==sec.previousFloorOrdinal||
   p.previousVersion!==sec.previousVersionAtSignature||
   p.previousDigest!==sec.previousDigestAtSignature ||
   p.previousVersion!==state.previousVersion||p.previousDigest!==state.previousHash||
   sec.floorOrdinal!==Math.max(p.floorOrdinal,p.ordinal))
   throw Error("M72_ACTIVE_SIGNATURE_INVALID");
}
module.exports={readTrust,provisionM72Trust,signM72Permit,verifyM72Permit,
 guardSignedActivation,verifySignedInstall};
