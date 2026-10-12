"use strict";
// Crash-reclaimable single-writer safety for an operator-controlled lab directory.
// PID locks are advisory and not a replacement for kernel flock on product hardware.
const fs=require("node:fs"),path=require("node:path");
const {randomUUID}=require("node:crypto");
function acquireEdgeLock(dir){
  const file=path.join(dir,"pef-edge-owner.json"),token=randomUUID();
  const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0);
  for(let attempt=0;attempt<3;attempt++){
    let fd;
    try{
      fd=fs.openSync(file,flags,0o600);
      const bytes=Buffer.from(JSON.stringify({pid:process.pid,token,kind:"PEF_LAB_SINGLE_WRITER"})+"\n");
      fs.writeSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
      const parent=fs.openSync(dir,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
      try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
      let closed=false;
      return {release(){
        if(closed)return;closed=true;
        let current;
        try{current=JSON.parse(fs.readFileSync(file,"utf8"));}
        catch{return;}
        if(current.token===token&&current.pid===process.pid)fs.unlinkSync(file);
      }};
    }catch(e){
      if(fd!==undefined){try{fs.closeSync(fd);}catch{}}
      if(e.code!=="EEXIST")throw e;
      let owner,stat;
      try{
        stat=fs.lstatSync(file);
        if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
          throw Error("EDGE_LOCK_UNSAFE");
        owner=JSON.parse(fs.readFileSync(file,"utf8"));
      }catch(err){throw Error("EDGE_LOCK_UNSAFE:"+err.message);}
      if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||
         typeof owner.token!=="string"||owner.kind!=="PEF_LAB_SINGLE_WRITER")
        throw Error("EDGE_LOCK_CORRUPT");
      try{process.kill(owner.pid,0);throw Error("EDGE_ALREADY_RUNNING");}
      catch(err){
        if(err.message==="EDGE_ALREADY_RUNNING")throw err;
        if(err.code!=="ESRCH")throw Error("EDGE_LOCK_UNKNOWN_OWNER");
      }
      const latest=fs.lstatSync(file);
      if(latest.ino!==stat.ino||latest.dev!==stat.dev)continue;
      fs.unlinkSync(file); // stale dead PID: lab-only best-effort reclaim
    }
  }
  throw Error("EDGE_LOCK_CONTENTION");
}
module.exports={acquireEdgeLock};
