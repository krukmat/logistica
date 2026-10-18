"use strict";
// M3.3 LAB-only transactional supervisor policy. NOT trusted device configuration or OTA.
// A staged revision never becomes committed during reboot or failure.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {validateIdentity}=require("../core/event-envelope.js");
const NAME="pef-m3-supervisor-policy.json";
function policyValid(p){
 return p!==null&&typeof p==="object"&&!Array.isArray(p)&&
  Object.keys(p).sort().join(",")==="healthFailures,healthIntervalMs,maxRestarts,restartDelayMs"&&
  Number.isSafeInteger(p.maxRestarts)&&p.maxRestarts>=0&&p.maxRestarts<=5&&
  Number.isSafeInteger(p.restartDelayMs)&&p.restartDelayMs>=100&&p.restartDelayMs<=10000&&
  Number.isSafeInteger(p.healthIntervalMs)&&p.healthIntervalMs>=100&&p.healthIntervalMs<=10000&&
  Number.isSafeInteger(p.healthFailures)&&p.healthFailures>=1&&p.healthFailures<=5;
}
function normalize(p){if(!policyValid(p))throw Error("M3_POLICY_INVALID");
 return {maxRestarts:p.maxRestarts,restartDelayMs:p.restartDelayMs,
  healthIntervalMs:p.healthIntervalMs,healthFailures:p.healthFailures};}
function digest(revision,policy){
 return crypto.createHash("sha256").update(JSON.stringify([revision,normalize(policy)])).digest("hex");
}
function revValid(v){
 return v&&Number.isSafeInteger(v.revision)&&v.revision>=1&&v.revision<1000000&&
  policyValid(v.policy)&&v.digest===digest(v.revision,v.policy);
}
function createM3PolicyStore({dir,identity,initialPolicy}={}){
 const scope=validateIdentity(identity);
 const root=fs.realpathSync(dir),file=path.join(root,NAME);
 const initial=normalize(initialPolicy);
 const rootStat=fs.lstatSync(root);
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error("M3_POLICY_DIR_UNSAFE");
 const read=()=>{
  let stat;
  try{stat=fs.lstatSync(file);}
  catch(e){if(e.code==="ENOENT")return null;throw e;}
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>8192)
   throw Error("M3_POLICY_FILE_UNSAFE");
  const f=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  let data;
  try{data=fs.readFileSync(f,"utf8");}finally{fs.closeSync(f);}
  let s;try{s=JSON.parse(data);}catch{throw Error("M3_POLICY_CORRUPT");}
  if(s?.kind!=="PEF_M3_POLICY_STORE_V1"||s.schemaVersion!==1||
    s.scope?.siteId!==scope.siteId||s.scope?.deviceId!==scope.deviceId||
    s.scope?.configRevision!==scope.configRevision||
    !revValid(s.committed)||(s.staged!==null&&!revValid(s.staged))||
    s.staged!==null&&s.staged.revision!==s.committed.revision+1)
   throw Error("M3_POLICY_CORRUPT_OR_SCOPE_MISMATCH");
  return s;
 };
 function write(state){
  const temp=path.join(root,NAME+".tmp."+process.pid+"."+crypto.randomBytes(5).toString("hex"));
  const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0);
  let fd=null;
  try{
   fd=fs.openSync(temp,flags,0o600);
   const b=Buffer.from(JSON.stringify(state)+"\n");
   let n=0;while(n<b.length){const w=fs.writeSync(fd,b,n,b.length-n);
    if(w<=0)throw Error("M3_POLICY_SHORT_WRITE");n+=w;}
   fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
   fs.renameSync(temp,file);
   const parent=fs.openSync(root,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
   try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
  }finally{
   if(fd!==null)fs.closeSync(fd);
   try{fs.unlinkSync(temp);}catch(e){if(e.code!=="ENOENT")throw e;}
  }
 }
 let data=read(),recoveredStage=false;
 if(data===null){
  const committed={revision:1,policy:initial,digest:digest(1,initial)};
  data={kind:"PEF_M3_POLICY_STORE_V1",schemaVersion:1,scope,committed,staged:null};
  write(data);
 }else if(data.staged!==null){
  data={...data,staged:null};
  write(data);recoveredStage=true;
 }
 const snapshot=()=>({revision:data.committed.revision,policy:{...data.committed.policy},
  stagedRevision:data.staged?.revision??null,recoveredStage,hardwareTrusted:false});
 function stage({expectedRevision,revision,policy}={}){
  if(data.staged)throw Error("M3_STAGE_ALREADY_PENDING");
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==data.committed.revision||
    revision!==expectedRevision+1)throw Error("M3_REVISION_CONFLICT");
  const normalized=normalize(policy);
  const staged={revision,policy:normalized,digest:digest(revision,normalized)};
  write({...data,staged});data={...data,staged};
  return snapshot();
 }
 function commit(){
  if(data.staged===null)throw Error("M3_NO_STAGED_POLICY");
  const next={...data,committed:data.staged,staged:null};
  write(next);data=next;return snapshot();
 }
 function rollback(){
  if(data.staged===null)return snapshot();
  const next={...data,staged:null};write(next);data=next;return snapshot();
 }
 return {snapshot,stage,commit,rollback};
}
module.exports={createM3PolicyStore,normalize};
