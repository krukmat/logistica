"use strict";
// W1.9.I lab-only file journal: fsync through the host OS, not physical power-loss certification.
// A SINGLE writer must own the file. No automatic repair/compaction on corrupted tails.
const fs=require("node:fs");
const path=require("node:path");
const {createHash}=require("node:crypto");
function digest(kind,id,payload,category){
  return createHash("sha256").update(JSON.stringify({kind,id,payload,category})).digest("hex");
}
function createFileJournal({dir,capacityBytes=1024*1024,controlReserveBytes}={}){
  if(typeof dir!=="string"||!dir)throw Error("JOURNAL_DIR_REQUIRED");
  if(!Number.isSafeInteger(capacityBytes)||capacityBytes<128)throw Error("INVALID_JOURNAL_CAPACITY");
  if(controlReserveBytes===undefined)controlReserveBytes=Math.min(4096,Math.floor(capacityBytes/4));
  if(!Number.isSafeInteger(controlReserveBytes)||controlReserveBytes<0||controlReserveBytes>=capacityBytes)
    throw Error("INVALID_CONTROL_RESERVE");
  if(!fs.statSync(dir).isDirectory())throw Error("JOURNAL_DIR_NOT_DIRECTORY");
  const file=path.join(fs.realpathSync(dir),"pef-journal.ndjson");
  const flags=fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_APPEND|(fs.constants.O_NOFOLLOW||0);
  const fd=fs.openSync(file,flags,0o600);
  const entries=new Map(),acked=new Set();
  let closed=false,unsafe=false,size=0;
  const signed=(kind,id,payload,category)=>({kind,id,payload,category,sha256:digest(kind,id,payload,category)});
  function checkOpen(){if(closed)throw Error("JOURNAL_CLOSED");}
  function load(){
    const raw=fs.readFileSync(file);
    size=raw.length;
    if(size>capacityBytes)throw Error("JOURNAL_OVER_CAPACITY");
    if(size&&!raw.toString("utf8").endsWith("\n"))throw Error("JOURNAL_UNSAFE_TAIL");
    for(const line of raw.toString("utf8").split("\n").filter(Boolean)){
      let record;
      try{record=JSON.parse(line);}catch{throw Error("JOURNAL_CORRUPT_JSON");}
      if(!record||!["EVENT","CLOUD_ACK"].includes(record.kind)||
         typeof record.id!=="string"||!record.id||
         record.sha256!==digest(record.kind,record.id,record.payload,record.category))throw Error("JOURNAL_CORRUPT_CHECKSUM");
      if(record.kind==="EVENT"){
        if(record.category!=="O0"&&record.category!=="O1"&&record.category!=="O2"&&record.category!=="O3")throw Error("JOURNAL_BAD_CATEGORY");
        if(entries.has(record.id))throw Error("JOURNAL_DUPLICATE_EVENT");
        entries.set(record.id,record);
      }else{
        if(!entries.has(record.id)||acked.has(record.id))throw Error("JOURNAL_BAD_CURSOR");
        acked.add(record.id);
      }
    }
  }
  try{load();}catch(err){fs.closeSync(fd);throw err;}
  function write(record,{useControlReserve=false}={}){
    checkOpen();
    if(unsafe)return {ok:false,ack:false,error:"STORAGE_UNSAFE"};
    const buffer=Buffer.from(JSON.stringify(record)+"\n","utf8");
    const limit=useControlReserve?capacityBytes:capacityBytes-controlReserveBytes;
    if(size+buffer.length>limit)return {ok:false,ack:false,error:"STORAGE_FULL_OR_UNSAFE",controlReserveProtected:!useControlReserve};
    try{
      let offset=0;
      while(offset<buffer.length){const n=fs.writeSync(fd,buffer,offset,buffer.length-offset,null);if(n<=0)throw Error("SHORT_WRITE");offset+=n;}
      fs.fsyncSync(fd);
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
    if(!entries.has(eventId))return {ok:false,ack:false,error:"EVENT_NOT_FOUND"};
    if(acked.has(eventId))return {ok:true,ack:true,duplicate:true,physicalPowerCutValidated:false};
    const res=write(signed("CLOUD_ACK",eventId,null,"P1"),{useControlReserve:true});
    if(res.ok)acked.add(eventId);
    return {...res,eventId};
  }
  const pending=()=>{checkOpen();return [...entries.values()].filter(e=>!acked.has(e.id)).map(e=>({eventId:e.id,payload:e.payload,category:e.category,sha256:e.sha256}));};
  const status=()=>{checkOpen();return {kind:"PEF_OS_FILE_JOURNAL",bytesUsed:size,capacityBytes,controlReserveBytes,regularWriteLimitBytes:capacityBytes-controlReserveBytes,events:entries.size,cloudAcked:acked.size,pending:entries.size-acked.size,unsafe,hardwareValidated:false,powerCutValidated:false};};
  function close(){if(closed)return;closed=true;fs.closeSync(fd);}
  return {append,cloudAck,pending,status,close,file};
}
module.exports={createFileJournal};
