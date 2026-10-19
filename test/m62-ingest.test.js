"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {validateCloudLiteEvent}=require("../src/core/cloud-lite-ingest-policy.js");
const {createCloudLiteEventStore}=require("../src/adapters/cloud-lite-event-file.js");
const {createFileJournal}=require("../src/adapters/os-file-journal.js");
const {createLocalReceipts}=require("../src/core/local-receipts.js");
const {runM62IngestSmoke}=require("../src/runtime/m62-ingest-smoke.js");
test("M6.2 rejects malformed categories, checksums and event envelopes",()=>{
 assert.equal(validateCloudLiteEvent(null).ok,false);
 assert.equal(validateCloudLiteEvent({category:"O9",eventId:"a"}).ok,false);
 assert.equal(validateCloudLiteEvent({category:"O1",eventId:"a",sha256:"0".repeat(64)}).ok,false);
});
test("M6.2 never returns a durable ACK when cloud event-store fsync fails",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m62-fsync-"));
 const source=path.join(root,"edge");fs.mkdirSync(source,{mode:0o700});
 let journal=null,cloud=null;
 try{
   journal=createFileJournal({dir:source,capacityBytes:65536,controlReserveBytes:4096});
   const local=createLocalReceipts({journal,identity:{
      siteId:"s",deviceId:"d",configRevision:"r"}});
   assert.equal(local.receive({receiptId:"R1",packageId:"P1"}).fsyncCompleted,true);
   const event=journal.pending()[0];
   let calls=0;
   const fsOps={...fs,fsyncSync(fd){
     calls++;
     if(calls===3)throw Error("INJECTED_REMOTE_FSYNC_FAIL");
     return fs.fsyncSync(fd);
   }};
   cloud=createCloudLiteEventStore({dir:root,fsOps});
   const result=cloud.ingest(event);
   assert.equal(result.durable,false);
   assert.equal(result.error,"CLOUD_LITE_EVENT_STORE_UNSAFE");
   assert.equal(cloud.status().unsafe,true);
   assert.equal(cloud.ingest(event).durable,false);
 }finally{cloud?.close();journal?.close();fs.rmSync(root,{recursive:true,force:true});}
});
test("M6.2 real HTTP: fsync ACK, auth, idempotence, conflicting replay, restart and torn log rejection",async()=>{
 const r=await runM62IngestSmoke();
 assert.equal(r.status,"LAB_PASS",JSON.stringify(r));
 assert.equal(Object.values(r.checks).every(Boolean),true);
 assert.equal(r.edgeHttpTransportConnected,false);
});
