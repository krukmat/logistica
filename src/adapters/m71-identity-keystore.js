"use strict";
// M7.1: local software Ed25519 identity, NOT a TPM or secure element.
// Durable create-once key material, 0600 permission, NEVER regenerate on corruption.
const fs=require("node:fs"),path=require("node:path");
const {generateKeyPairSync,createPrivateKey,createPublicKey,sign,verify,createHash}=require("node:crypto");
const {validateIdentity}=require("../core/event-envelope.js");
const {safeDir}=require("../runtime/m5-install.js");
const {frame,sameScope}=require("../core/m71-identity-policy.js");
const FILE="pef-m71-identity-v1.json";
function fingerprint(pem){
 return createHash("sha256").update(createPublicKey(pem).export({type:"spki",format:"der"})).digest("hex");
}
function readIdentity(dir,identity){
 const base=safeDir(dir),file=path.join(base,FILE);
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>8192)
   throw Error("M71_IDENTITY_FILE_UNSAFE");
 let doc;
 try{doc=JSON.parse(fs.readFileSync(file,"utf8"));}
 catch{throw Error("M71_IDENTITY_CORRUPT");}
 const expected=validateIdentity(identity);
 if(doc?.kind!=="PEF_M71_SOFTWARE_IDENTITY_V1"||doc.schemaVersion!==1||
   !sameScope(doc.identity,expected)||typeof doc.privateKeyPem!=="string"||
   typeof doc.publicKeyPem!=="string"||!/^[a-f0-9]{64}$/.test(doc.keyId))
   throw Error("M71_IDENTITY_MISMATCH");
 try{
  const key=createPrivateKey(doc.privateKeyPem);
  if(key.asymmetricKeyType!=="ed25519"||
    createPublicKey(key).export({type:"spki",format:"pem"})!==doc.publicKeyPem||
    fingerprint(doc.publicKeyPem)!==doc.keyId)throw Error("bad-key");
 }catch{throw Error("M71_IDENTITY_KEY_CORRUPT");}
 return doc;
}
function openM71SoftwareIdentity({dir,identity}={}){
 const scope=validateIdentity(identity),root=safeDir(dir);
 const file=path.join(root,FILE);
 let created=false;
 try{
  // Only ENOENT allows provisioning. Existing invalid/inaccessible state MUST fail closed.
  fs.lstatSync(file);
 }catch(e){
  if(e.code!=="ENOENT")throw e;
  const pair=generateKeyPairSync("ed25519",{
   privateKeyEncoding:{type:"pkcs8",format:"pem"},
   publicKeyEncoding:{type:"spki",format:"pem"}});
  const doc={kind:"PEF_M71_SOFTWARE_IDENTITY_V1",schemaVersion:1,
   identity:scope,keyId:fingerprint(pair.publicKey),publicKeyPem:pair.publicKey,
   privateKeyPem:pair.privateKey};
  let fd=null;
  try{
   fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|
      fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
   fs.writeFileSync(fd,JSON.stringify(doc)+"\n");fs.fsyncSync(fd);
   fs.closeSync(fd);fd=null;
   const parent=fs.openSync(root,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
   try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
   created=true;
  }finally{if(fd!==null)fs.closeSync(fd);}
 }
 const loaded=readIdentity(root,scope);
 return Object.freeze({
  identity:scope,keyId:loaded.keyId,publicKeyPem:loaded.publicKeyPem,
  created,storage:"LOCAL_SOFTWARE_KEY_0600",physicalValidated:false,
  hardwareBacked:false,
  prove(nonce){
   const latest=readIdentity(root,scope);
   if(latest.keyId!==loaded.keyId)throw Error("M71_IDENTITY_REPLACED");
   const signature=sign(null,frame(scope,nonce),createPrivateKey(latest.privateKeyPem)).toString("base64");
   return {kind:"PEF_M71_IDENTITY_PROOF_V1",identity:scope,keyId:loaded.keyId,
     nonce,signature,algorithm:"Ed25519"};
  }
 });
}
function verifyM71Proof(proof,expectedIdentity,expectedKey,nonce){
 try{
  const actual=validateIdentity(expectedIdentity);
  if(proof?.kind!=="PEF_M71_IDENTITY_PROOF_V1"||proof.algorithm!=="Ed25519"||
    !sameScope(proof.identity,actual)||proof.nonce!==nonce||
    proof.keyId!==fingerprint(expectedKey)||
    typeof proof.signature!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(proof.signature))
    return false;
  return verify(null,frame(actual,nonce),createPublicKey(expectedKey),
    Buffer.from(proof.signature,"base64"));
 }catch{return false;}
}
module.exports={openM71SoftwareIdentity,verifyM71Proof,readIdentity};
