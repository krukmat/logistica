"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runStorageFaultConformance}=require("../src/runtime/storage-fault-conformance.js");
const {createFileJournal}=require("../src/adapters/os-file-journal.js");
const {createFaultableFileOps}=require("../src/adapters/faultable-file-ops.js");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
test("W1.10.B3 disk full, torn write, ambiguous fsync, quota, corruption, compact crash and metadata matrix",()=>{
 const checks=runStorageFaultConformance();
 const ids=["STORAGE_ENOSPC_FAIL_CLOSED","STORAGE_PARTIAL_WRITE_QUARANTINE","STORAGE_ZERO_WRITE_NO_ACK",
  "STORAGE_FSYNC_AMBIGUITY_IDEMPOTENT_RECOVERY","STORAGE_QUOTA_CONTROL_RESERVE",
  "STORAGE_CHECKSUM_CORRUPTION_BLOCKED","STORAGE_TRUNCATED_TAIL_BLOCKED",
  "STORAGE_COMPACTION_PRE_RENAME_RECOVERY","STORAGE_COMPACTION_POST_RENAME_RECHECK",
  "STORAGE_LEGACY_METADATA_MIGRATION","STORAGE_FUTURE_SCHEMA_REFUSED"];
 assert.deepEqual(checks.map(x=>x.id),ids);
 assert.ok(checks.every(x=>x.pass),JSON.stringify(checks.filter(x=>!x.pass)));
});
test("W1.10.B3 injected filesystem fault port validates configuration and never exhausts host storage",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-storage-port-"));
 try{
   const driver=createFaultableFileOps();
   assert.throws(()=>driver.failNextWrite("unknown"),/INVALID_STORAGE_FAULT/);
   const journal=createFileJournal({dir,fsOps:driver.fsOps});
   driver.failNextWrite("enospc");
   const denied=journal.append({eventId:"not-durable"});
   assert.equal(denied.ack,false);
   assert.equal(journal.status().unsafe,true);
   assert.equal(driver.snapshot().hostDiskExhausted,false);
   journal.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
