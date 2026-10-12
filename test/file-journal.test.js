"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process");
const {createFileJournal}=require("../src/emulator/lab/file-journal.js");
function sandbox(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-journal-"));
  try{return fn(dir);}finally{fs.rmSync(dir,{force:true,recursive:true});}
}
test("file journal returns ACK only after host fsync and survives reopen",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  const a=j.append({eventId:"persisted",payload:{serial:1},category:"O1"});
  assert.equal(a.ack,true);assert.equal(a.fsyncCompleted,true);assert.equal(a.physicalPowerCutValidated,false);
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.deepEqual(j.pending().map(x=>x.eventId),["persisted"]);
  assert.equal(j.status().powerCutValidated,false);
  j.close();
}));
test("deduplication does not ACK discordant IDs, even after reload",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.append({eventId:"stable",payload:{v:1}}).ack,true);
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.append({eventId:"stable",payload:{v:1}}).duplicate,true);
  const conflict=j.append({eventId:"stable",payload:{v:2}});
  assert.equal(conflict.ack,false);assert.equal(conflict.error,"EVENT_ID_CONFLICT");
  assert.equal(j.status().events,1);j.close();
}));
test("bounded P1 storage rejects new writes without false ACK",()=>sandbox(dir=>{
  const j=createFileJournal({dir,capacityBytes:256});
  assert.equal(j.append({eventId:"large",payload:{s:"x".repeat(1000)}}).error,"STORAGE_FULL_OR_UNSAFE");
  assert.equal(j.status().events,0);assert.equal(j.status().bytesUsed,0);j.close();
}));
test("cloud ACK is durable and idempotent without deleting critical journal history",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.append({eventId:"q",payload:{a:true}}).ack,true);
  assert.equal(j.cloudAck("q").fsyncCompleted,true);
  j.close();j=createFileJournal({dir,capacityBytes:65536});
  assert.equal(j.status().cloudAcked,1);assert.equal(j.pending().length,0);
  assert.equal(j.cloudAck("q").duplicate,true);
  assert.equal(j.status().events,1);j.close();
}));
test("corrupted or incomplete log tail fails closed",()=>sandbox(dir=>{
  let j=createFileJournal({dir,capacityBytes:65536});
  j.append({eventId:"first",payload:{v:1}});const file=j.file;j.close();
  fs.appendFileSync(file,'{"kind":"EVENT"');
  assert.throws(()=>createFileJournal({dir,capacityBytes:65536}),/JOURNAL_UNSAFE_TAIL/);
}));
test("committed file-journal record survives SIGKILL of the owning child process",()=>sandbox(dir=>{
  const result=spawnSync(process.execPath,[path.resolve(__dirname,"../bin/pef-journal-crash-child.js"),dir],{
    encoding:"utf8",timeout:5000});
  assert.match(result.stdout,/FSYNC_ACK/);
  assert.equal(result.signal,"SIGKILL");
  const reopened=createFileJournal({dir,capacityBytes:65536});
  assert.deepEqual(reopened.pending().map(x=>x.eventId),["crash-acked"]);
  reopened.close();
}));
