"use strict";
// OS file-journal adapter for portable PEF Core; host OS fsync lab evidence only: fsync through the host OS, not physical power-loss certification.
// A SINGLE writer must own the file. No automatic repair/compaction on corrupted tails.
const fs=require("node:fs");
const path=require("node:path");
const {createHash,randomUUID}=require("node:crypto");
function digest(kind,id,payload,category){
  return createHash("sha256").update(JSON.stringify({kind,id,payload,category})).digest("hex");
}
function createFileJournal({dir,capacityBytes=1024*1024,controlReserveBytes,fsOps=fs}={}){
  // fsOps is a trusted in-process test injection port, never accepted from HTTP/config.
  if(typeof dir!=="string"||!dir)throw Error("JOURNAL_DIR_REQUIRED");
  if(!Number.isSafeInteger(capacityBytes)||capacityBytes<128)throw Error("INVALID_JOURNAL_CAPACITY");
  if(controlReserveBytes===undefined)controlReserveBytes=Math.min(4096,Math.floor(capacityBytes/4));
  if(!Number.isSafeInteger(controlReserveBytes)||controlReserveBytes<0||controlReserveBytes>=capacityBytes)
    throw Error("INVALID_CONTROL_RESERVE");
  if(!fsOps||["statSync","realpathSync","openSync","closeSync","readFileSync","writeSync","fsyncSync","renameSync","unlinkSync"].some(k=>typeof fsOps[k]!=="function"))throw Error("INVALID_JOURNAL_FS_PORT");
  if(!fsOps.statSync(dir).isDirectory())throw Error("JOURNAL_DIR_NOT_DIRECTORY");
  const file=path.join(fsOps.realpathSync(dir),"pef-journal.ndjson");
  const flags=fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_APPEND|(fs.constants.O_NOFOLLOW||0);
  let fd=fsOps.openSync(file,flags,0o600);
  const entries=new Map(),acked=new Set(),refs=new Map();
  let closed=false,unsafe=false,size=0,legacyRecords=0;
  const signed=(kind,id,payload,category)=>({recordSchemaVersion:1,kind,id,payload,category,sha256:digest(kind,id,payload,category)});
  function checkOpen(){if(closed)throw Error("JOURNAL_CLOSED");}
  function load(){
    const raw=fsOps.readFileSync(file);
    entries.clear();acked.clear();refs.clear();legacyRecords=0;
    size=raw.length;
    if(size>capacityBytes)throw Error("JOURNAL_OVER_CAPACITY");
    if(size&&!raw.toString("utf8").endsWith("\n"))throw Error("JOURNAL_UNSAFE_TAIL");
    for(const line of raw.toString("utf8").split("\n").filter(Boolean)){
      let record;
      try{record=JSON.parse(line);}catch{throw Error("JOURNAL_CORRUPT_JSON");}
      if(record&&record.recordSchemaVersion!==undefined&&record.recordSchemaVersion!==1)
        throw Error("JOURNAL_SCHEMA_UNSUPPORTED");
      if(record&&record.recordSchemaVersion===undefined)legacyRecords++;
      if(!record||!["EVENT","CLOUD_ACK","ACKED_REF"].includes(record.kind)||
         typeof record.id!=="string"||!record.id||
         record.sha256!==digest(record.kind,record.id,record.payload,record.category))throw Error("JOURNAL_CORRUPT_CHECKSUM");
      if(record.kind==="EVENT"){
        if(record.category!=="O0"&&record.category!=="O1"&&record.category!=="O2"&&record.category!=="O3")throw Error("JOURNAL_BAD_CATEGORY");
        if(entries.has(record.id)||refs.has(record.id))throw Error("JOURNAL_DUPLICATE_EVENT");
        entries.set(record.id,record);
      }else if(record.kind==="CLOUD_ACK"){
        if(!entries.has(record.id)||acked.has(record.id))throw Error("JOURNAL_BAD_CURSOR");
        acked.add(record.id);
      }else{
        // A compacted O2/O3 event is still identifiable by the original EVENT digest.
        if(!["O2","O3"].includes(record.category)||!(/^[a-f0-9]{64}$/).test(record.payload)||
           entries.has(record.id)||refs.has(record.id))throw Error("JOURNAL_BAD_COMPACTED_REF");
        refs.set(record.id,{digest:record.payload,category:record.category});
      }
    }
  }
  try{load();}catch(err){fsOps.closeSync(fd);throw err;}
  function write(record,{useControlReserve=false}={}){
    checkOpen();
    if(unsafe)return {ok:false,ack:false,error:"STORAGE_UNSAFE"};
    const buffer=Buffer.from(JSON.stringify(record)+"\n","utf8");
    const limit=useControlReserve?capacityBytes:capacityBytes-controlReserveBytes;
    if(size+buffer.length>limit)return {ok:false,ack:false,error:"STORAGE_FULL_OR_UNSAFE",controlReserveProtected:!useControlReserve};
    try{
      let offset=0;
      while(offset<buffer.length){const n=fsOps.writeSync(fd,buffer,offset,buffer.length-offset,null);if(n<=0)throw Error("SHORT_WRITE");offset+=n;}
      fsOps.fsyncSync(fd);
      size+=buffer.length;
      return {ok:true,ack:true,fsyncCompleted:true,physicalPowerCutValidated:false};
    }catch(err){unsafe=true;return {ok:false,ack:false,error:"STORAGE_UNSAFE",detail:String(err.code||err.message||err)};}
  }
  function append({eventId,payload={},category="O1"}={}){
    checkOpen();
    if(typeof eventId!=="string"||!eventId||eventId.length>160||!["O0","O1","O2","O3"].includes(category))
      return {ok:false,ack:false,error:"INVALID_EVENT"};
    const record=signed("EVENT",eventId,payload,category);
    const previous=entries.get(eventId);
    const compacted=refs.get(eventId);
    if(compacted){
      if(compacted.digest!==record.sha256)return {ok:false,ack:false,error:"EVENT_ID_CONFLICT"};
      return {ok:true,ack:true,duplicate:true,fsyncCompleted:true,physicalPowerCutValidated:false};
    }
    if(previous){
      if(previous.sha256!==record.sha256)return {ok:false,ack:false,error:"EVENT_ID_CONFLICT"};
      return {ok:true,ack:true,duplicate:true,fsyncCompleted:true,physicalPowerCutValidated:false};
    }
    const res=write(record);
    if(res.ok)entries.set(eventId,record);
    return {...res,eventId};
  }
  function cloudAck(eventId){
    checkOpen();
    if(refs.has(eventId))return {ok:true,ack:true,duplicate:true,physicalPowerCutValidated:false};
    if(!entries.has(eventId))return {ok:false,ack:false,error:"EVENT_NOT_FOUND"};
    if(acked.has(eventId))return {ok:true,ack:true,duplicate:true,physicalPowerCutValidated:false};
    const res=write(signed("CLOUD_ACK",eventId,null,"P1"),{useControlReserve:true});
    if(res.ok)acked.add(eventId);
    return {...res,eventId};
  }
  const pending=()=>{checkOpen();return [...entries.values()].filter(e=>!acked.has(e.id)).map(e=>({eventId:e.id,payload:e.payload,category:e.category,sha256:e.sha256}));};
  const retained=()=>{checkOpen();return [...entries.values()].map(e=>({
    eventId:e.id,payload:e.payload,category:e.category,sha256:e.sha256,
    cloudAcked:acked.has(e.id)
  }));};
  const status=()=>{checkOpen();return {kind:"PEF_OS_FILE_JOURNAL",recordSchemaVersion:1,legacyRecords,bytesUsed:size,capacityBytes,controlReserveBytes,regularWriteLimitBytes:capacityBytes-controlReserveBytes,events:entries.size+refs.size,retainedEvents:entries.size,compactedRefs:refs.size,cloudAcked:acked.size+refs.size,pending:entries.size-acked.size,unsafe,hardwareValidated:false,powerCutValidated:false};};
  // Rewrites are atomic on the current filesystem: stage/fsync/rename/fsync directory.
  // Single-writer laboratory contract: no cross-process lock or hardware power-loss guarantee.
  function compact({testHook}={}){
    checkOpen();
    if(unsafe)return {ok:false,error:"STORAGE_UNSAFE"};
    if(testHook!==undefined&&typeof testHook!=="function")return {ok:false,error:"INVALID_COMPACTION_HOOK"};
    const sizeBefore=size;
    const retained=[], tombstones=[];
    for(const entry of entries.values()){
      if(acked.has(entry.id)&&["O2","O3"].includes(entry.category))
        tombstones.push(signed("ACKED_REF",entry.id,entry.sha256,entry.category));
      else retained.push(signed(entry.kind,entry.id,entry.payload,entry.category));
    }
    const retainedEvents=retained.slice();
    for(const entry of retainedEvents){
      if(acked.has(entry.id))retained.push(signed("CLOUD_ACK",entry.id,null,"P1"));
    }
    for(const [id,ref] of refs)tombstones.push(signed("ACKED_REF",id,ref.digest,ref.category));
    const staged=[...retained,...tombstones].map(record=>JSON.stringify(record)+"\n").join("");
    const bytes=Buffer.from(staged,"utf8");
    if(bytes.length>capacityBytes-controlReserveBytes)
      return {ok:false,error:"COMPACTION_NO_SPACE",requiredBytes:bytes.length,regularLimitBytes:capacityBytes-controlReserveBytes};
    const temp=file+".compact-"+randomUUID();
    let tempFd=null,renamed=false;
    try{
      tempFd=fsOps.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
      let at=0;
      while(at<bytes.length){const n=fsOps.writeSync(tempFd,bytes,at,bytes.length-at,null);if(n<=0)throw Error("SHORT_WRITE");at+=n;}
      fsOps.fsyncSync(tempFd);fsOps.closeSync(tempFd);tempFd=null;
      if(testHook)testHook("afterStageFsync");
      fsOps.renameSync(temp,file);renamed=true;
      if(testHook)testHook("afterRename");
      const dirFd=fsOps.openSync(path.dirname(file),fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
      try{fsOps.fsyncSync(dirFd);}finally{fsOps.closeSync(dirFd);}
      fsOps.closeSync(fd);
      // Keep the same inode as the file path for subsequent O_APPEND writes.
      fd=fsOps.openSync(file,flags,0o600);
      load();
      return {ok:true,fsyncCompleted:true,physicalPowerCutValidated:false,
        beforeBytes:sizeBefore,afterBytes:size,retainedCritical:[...entries.values()].filter(e=>acked.has(e.id)&&["O0","O1"].includes(e.category)).length,compactedRefs:refs.size};
    }catch(err){
      unsafe=true; // The object must not append to an old inode after rename.
      return {ok:false,error:"COMPACTION_UNCERTAIN",phase:renamed?"AFTER_RENAME":"BEFORE_RENAME",
        detail:String(err.code||err.message||err),reopenRequired:true,physicalPowerCutValidated:false};
    }finally{
      if(tempFd!==null)fsOps.closeSync(tempFd);
      // Pre-rename staged files are inert; remove them on best effort only.
      if(!renamed){try{fsOps.unlinkSync(temp);}catch{}}
    }
  }
  function close(){if(closed)return;closed=true;fsOps.closeSync(fd);}
  return {append,cloudAck,pending,retained,status,compact,close,file};
}
module.exports={createFileJournal};
