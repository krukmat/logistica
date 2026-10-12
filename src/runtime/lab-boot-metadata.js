"use strict";
// W1.9.P1 lab metadata, NOT a hardware identity, credential store or PKI.
const fs=require("node:fs"),path=require("node:path");
const {randomUUID}=require("node:crypto");
const {validateIdentity}=require("../core/event-envelope.js");
function openLabBoot({dir,identity}={}){
  const expected=validateIdentity(identity);
  if(typeof dir!=="string"||!fs.statSync(dir).isDirectory())throw Error("INVALID_BOOT_DIR");
  const base=fs.realpathSync(dir),file=path.join(base,"pef-lab-identity.json");
  const readFlags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0);
  const newValue={schemaVersion:1,...expected,provisioning:"LAB_ONLY_NOT_TRUSTED"};
  let created=false;
  let fd=null;
  try{
    try{
      fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|
        fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
      created=true;
      const bytes=Buffer.from(JSON.stringify(newValue)+"\n","utf8");
      let position=0;
      while(position<bytes.length){
        const count=fs.writeSync(fd,bytes,position,bytes.length-position,null);
        if(count<=0)throw Error("BOOT_SHORT_WRITE");
        position+=count;
      }
      fs.fsyncSync(fd);
      fs.closeSync(fd);fd=null;
      const parent=fs.openSync(base,readFlags|(fs.constants.O_DIRECTORY||0));
      try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
    }catch(err){
      if(err.code!=="EEXIST")throw err;
    }
  }finally{if(fd!==null)fs.closeSync(fd);}
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0)
    throw Error("LAB_BOOT_METADATA_UNSAFE");
  const contents=fs.readFileSync(file,{encoding:"utf8",flag:"r"});
  let stored;
  try{stored=JSON.parse(contents);}catch{throw Error("LAB_BOOT_CORRUPT");}
  if(!stored||stored.schemaVersion!==1||stored.provisioning!==newValue.provisioning||
    stored.siteId!==expected.siteId||stored.deviceId!==expected.deviceId||
    stored.configRevision!==expected.configRevision)
    throw Error("LAB_BOOT_IDENTITY_CONFLICT");
  return {identity:expected,sessionId:randomUUID(),bootScope:"LAB_ONLY",
    metadataFsync:true,created,hardwareProvisioned:false,credentialsProvisioned:false};
}
module.exports={openLabBoot};
