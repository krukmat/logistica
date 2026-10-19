"use strict";
// M6.2 append-only fsync per event. Registry owns single-writer lock on this directory.
// No physical powercut guarantees; torn/invalid tails fail closed on reopen.
const fs=require("node:fs"),path=require("node:path");
const {validateCloudLiteEvent}=require("../core/cloud-lite-ingest-policy.js");
const FILE="pef-cloud-lite-events-v1.ndjson";
const MAX_BYTES=4*1024*1024,MAX_EVENTS=4096;
function createCloudLiteEventStore({dir,fsOps=fs}={}){
 if(typeof dir!=="string"||!path.isAbsolute(dir)||!fsOps.statSync(dir).isDirectory())
   throw Error("CLOUD_LITE_EVENT_ROOT_REQUIRED");
 const file=path.join(dir,FILE);
 const flags=fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_APPEND|(fs.constants.O_NOFOLLOW||0);
 let fd=fsOps.openSync(file,flags,0o600),unsafe=false,closed=false,bytes=0;
 const events=new Map();
 const ensure=()=>{if(closed)throw Error("CLOUD_LITE_EVENT_STORE_CLOSED");};
 try{
  const st=fsOps.fstatSync(fd);
  if(!st.isFile()||(st.mode&0o077)!==0||st.size>MAX_BYTES)
    throw Error("CLOUD_LITE_EVENTS_FILE_UNSAFE");
  bytes=st.size;
  if(bytes){
   const buffer=fsOps.readFileSync(file);
   if(buffer.length!==bytes||buffer[buffer.length-1]!==10)
     throw Error("CLOUD_LITE_EVENTS_TRUNCATED");
   for(const line of buffer.toString("utf8").trimEnd().split("\n")){
     if(!line||line.length>16384)throw Error("CLOUD_LITE_EVENT_RECORD_TOO_LARGE");
     let record;try{record=JSON.parse(line);}
     catch{throw Error("CLOUD_LITE_EVENT_RECORD_CORRUPT");}
     if(record?.kind!=="PEF_CLOUD_LITE_INGEST_V1"||
       !validateCloudLiteEvent(record.event).ok)
       throw Error("CLOUD_LITE_EVENT_RECORD_INVALID");
     const old=events.get(record.event.eventId);
     if(old)throw Error("CLOUD_LITE_EVENT_DUPLICATED_ON_DISK");
     events.set(record.event.eventId,record.event.sha256);
   }
  }
  if(events.size>MAX_EVENTS)throw Error("CLOUD_LITE_EVENT_CAPACITY_INVALID");
 }catch(e){fsOps.closeSync(fd);throw e;}
 return {
  ingest(event){
   ensure();
   if(unsafe)return {ok:false,durable:false,error:"CLOUD_LITE_EVENT_STORE_UNSAFE"};
   const validation=validateCloudLiteEvent(event);
   if(!validation.ok)return {ok:false,durable:false,error:validation.error};
   const old=events.get(event.eventId);
   if(old){
     if(old!==event.sha256)return {ok:false,durable:false,error:"EVENT_ID_CONFLICT"};
     return {ok:true,durable:true,duplicate:true,scope:validation.scope};
   }
   const record={kind:"PEF_CLOUD_LITE_INGEST_V1",event};
   const data=Buffer.from(JSON.stringify(record)+"\n");
   if(data.length>16384)return {ok:false,durable:false,error:"CLOUD_LITE_EVENT_TOO_LARGE"};
   if(events.size>=MAX_EVENTS||bytes+data.length>MAX_BYTES)
     return {ok:false,durable:false,error:"CLOUD_LITE_EVENT_CAPACITY"};
   try{
     let offset=0;
     while(offset<data.length){
       const n=fsOps.writeSync(fd,data,offset,data.length-offset);
       if(n<=0)throw Error("CLOUD_LITE_WRITE_INCOMPLETE");
       offset+=n;
     }
     fsOps.fsyncSync(fd);
   }catch{
     unsafe=true;
     return {ok:false,durable:false,error:"CLOUD_LITE_EVENT_STORE_UNSAFE"};
   }
   bytes+=data.length;events.set(event.eventId,event.sha256);
   return {ok:true,durable:true,duplicate:false,scope:validation.scope};
  },
  status(){ensure();return {stored:events.size,bytes,unsafe,fsyncPerEvent:true,physicalValidated:false};},
  close(){if(closed)return;closed=true;fsOps.closeSync(fd);}
 };
}
module.exports={createCloudLiteEventStore};
