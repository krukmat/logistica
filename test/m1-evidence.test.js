"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createBundle,verifyBundle}=require("../src/runtime/m1-evidence-bundle.js");
test("M1 E2E: autonomous daemon, fsync offline, process SIGKILL, mock ACK loss & replay",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m1-evidence-"));
 try{
  const {dir,report,verification}=await createBundle({outputRoot:root});
  assert.equal(report.ok,true,JSON.stringify(report));
  assert.equal(report.checks.length,7);
  assert.equal(verification.ok,true);
  assert.equal(report.final.pending,0);
  assert.equal(report.limits.realCloudValidated,false);
  assert.equal(report.limits.realProcessSigkill,true);
  const original=fs.readFileSync(path.join(dir,"summary.md"),"utf8");
  fs.writeFileSync(path.join(dir,"summary.md"),original+"\nTAMPER\n");
  assert.throws(()=>verifyBundle(dir),/M1_FILE_DIGEST_MISMATCH/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
