"use strict";
// M7.4 append-only fsynced hash-chain evidence. No hardware monotonic counter.
// Complete-file rewrite/tampering by root is outside threat model.
const fs=require("node:fs"),path=require("node:path");
const {createHash,timingSafeEqual}=require("node:crypto");
const {safeDir}=require("../runtime/m5-install.js");
const {validateM74Event,scopedIdentity}=require("../core/m74-operations-policy.js");
const FILE="pef-m74-operations-v1.ndjson",MAX=512*1024,MAX_EVENTS=1024;
const sha=s=>createHash("sha256").update(s).digest("hex");
function digest(rec){
 const {kind,sequence,scope,previous,event}=rec;
 return sha(JSON.stringify([kind,sequence,scope,previous,event]));
}
function createM74OperationsLedger({dir,identity,operatorToken}={}){
 if(typeof operatorToken!=="string"||!/^[a-f0-9]{64}$/.test(operatorToken))
  throw Error("M74_OPERATOR_TOKEN_INVALID");
 const scope=scopedIdentity(identity),root=safeDir(dir),file=path.join(root,FILE);
 const first=!fs.existsSync(file);
 const fd=fs.openSync(file,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_APPEND|
    (fs.constants.O_NOFOLLOW||0),0o600);
 let previous="0".repeat(64),sequence=0,bytes=0,unsafe=false,closed=false;
 try{
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>MAX)throw Error("M74_LOG_UNSAFE");
  bytes=stat.size;
  if(bytes){
   const buf=fs.readFileSync(file);
   if(buf.length!==bytes||buf.at(-1)!==10)throw Error("M74_LOG_TRUNCATED");
   for(const line of buf.toString("utf8").trimEnd().split("\n")){
    let row;try{row=JSON.parse(line);}catch{throw Error("M74_LOG_CORRUPT");}
    if(row.kind!=="PEF_M74_OPERATION_V1"||row.sequence!==sequence+1||
      row.previous!==previous||JSON.stringify(row.scope)!==JSON.stringify(scope)||
      row.sha256!==digest(row))throw Error("M74_CHAIN_INVALID");
    validateM74Event(row.event);
    previous=row.sha256;sequence++;
   }
  }
  if(sequence>MAX_EVENTS)throw Error("M74_LOG_CAPACITY");
  if(first){
   fs.fsyncSync(fd);
   const parent=fs.openSync(root,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
   try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
  }
 }catch(e){fs.closeSync(fd);throw e;}
 const snapshot=()=>({kind:"PEF_M74_OPERATIONS_STATUS_V1",events:sequence,
  lastDigest:previous,unsafe,scope,hardwareValidated:false});
 const read=()=>{
  if(closed||unsafe)throw Error("M74_LOG_UNAVAILABLE");
  const content=fs.readFileSync(file,"utf8").trimEnd();
  return content?content.split("\n").map(s=>JSON.parse(s)):[];};
 return {
  append(event,{token}={}){
   if(closed||unsafe)throw Error("M74_LOG_UNAVAILABLE");
   const normalized=validateM74Event(event);
   if(normalized.actor==="OPERATOR"){
    if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(
      Buffer.from(token,"hex"),Buffer.from(operatorToken,"hex")))
      throw Error("M74_OPERATOR_AUTH_DENIED");
   }
   if(sequence>=MAX_EVENTS)throw Error("M74_LOG_CAPACITY");
   const row={kind:"PEF_M74_OPERATION_V1",sequence:sequence+1,
    scope,previous,event:normalized};
   row.sha256=digest(row);
   const payload=Buffer.from(JSON.stringify(row)+"\n");
   if(bytes+payload.length>MAX)throw Error("M74_LOG_CAPACITY");
   try{
    let n=0;while(n<payload.length){
     const wrote=fs.writeSync(fd,payload,n,payload.length-n);
     if(wrote<=0)throw Error("M74_SHORT_WRITE");n+=wrote;
    }
    fs.fsyncSync(fd);
   }catch{unsafe=true;throw Error("M74_LOG_FSYNC_UNSAFE");}
   sequence++;previous=row.sha256;bytes+=payload.length;
   return {accepted:true,fsyncCompleted:true,sequence,digest:previous};
  },
  snapshot,read,
  close(){if(closed)return;closed=true;fs.closeSync(fd);}
 };
}
module.exports={createM74OperationsLedger};
