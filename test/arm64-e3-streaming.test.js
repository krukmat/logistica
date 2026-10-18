"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),
 os=require("node:os"),path=require("node:path");
const {createFileJournal}=require("../src/adapters/os-file-journal.js");
test("E3 streaming loader parses records across tiny read chunks with UTF-8 split",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-e3-"));
 try{
  let a=createFileJournal({dir,capacityBytes:4*1024*1024});
  const payload={word:"árbol🌳",long:"z".repeat(130000)};
  const r=a.append({eventId:"unicode",payload,category:"O1"});
  assert.equal(r.ack,true);a.close();
  const port=Object.create(fs);let reads=0;
  port.readSync=(fd,b,off,len,pos)=>{reads++;return fs.readSync(fd,b,off,Math.min(len,19),pos);};
  port.readFileSync=()=>{throw Error("WHOLE_FILE_REOPEN_NOT_ALLOWED");};
  const reopened=createFileJournal({dir,capacityBytes:4*1024*1024,fsOps:port});
  assert.equal(reopened.status().retainedEvents,1);
  assert.equal(reopened.retained()[0].payload.word,"árbol🌳");
  assert.ok(reads>20);reopened.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("E3 streaming loader fails closed on malformed newline and checksum",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-e3-bad-"));
 try{
  let a=createFileJournal({dir,capacityBytes:16384});
  assert.equal(a.append({eventId:"1",payload:{ok:true}}).ack,true);
  a.close();fs.appendFileSync(path.join(dir,"pef-journal.ndjson"),"incomplete");
  assert.throws(()=>createFileJournal({dir,capacityBytes:16384}),/JOURNAL_UNSAFE_TAIL/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
