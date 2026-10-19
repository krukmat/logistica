"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createBundle,verifyBundle,validateTrace,NAMES}=require("../src/runtime/m4-evidence-bundle.js");
const {buildTrace,validateIntegrated}=require("../src/runtime/m4-integrated.js");
test("M4.4.1/2 one real Property+Host+M4.3 run builds SHA256 bundle and rejects tampering",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m4-bundle-test-"));
 try{
   const result=await createBundle({outputRoot:root});
   assert.equal(result.report.status,"LAB_PASS");
   assert.equal(result.report.property.status,"LAB_PASS");
   assert.equal(result.report.host.status,"LAB_PASS");
   assert.equal(result.report.commonality.status,"LAB_PASS");
   assert.equal(result.report.property.incident.status,"ACKNOWLEDGED");
   assert.equal(result.report.host.incident.status,"ACKNOWLEDGED");
   assert.equal(result.report.commonality.profiles.host.runtime.checks.MOCK_DUPLICATE_REPLAY,true);
   assert.equal(result.report.limits.physicalValidated,false);
   assert.equal(result.report.limits.signatureValidated,false);
   assert.equal(result.trace.length,92);
   assert.equal(verifyBundle(result.dir).assertions,92);
   for(const n of [...NAMES,"SHA256SUMS","manifest.json"])
     assert.ok(fs.statSync(path.join(result.dir,n)).isFile(),n);
   const reportFile=path.join(result.dir,"report.json"),copy=fs.readFileSync(reportFile);
   fs.appendFileSync(reportFile,"tamper");
   assert.throws(()=>verifyBundle(result.dir),/M4_BUNDLE_DIGEST_MISMATCH/);
   fs.writeFileSync(reportFile,copy);
   const traceFile=path.join(result.dir,"events.ndjson"),raw=fs.readFileSync(traceFile);
   fs.writeFileSync(traceFile,raw.subarray(0,raw.length-1));
   assert.throws(()=>verifyBundle(result.dir),/M4_BUNDLE_DIGEST_MISMATCH/);
   fs.writeFileSync(traceFile,raw);
   fs.renameSync(path.join(result.dir,"summary.md"),path.join(root,"hidden.md"));
   assert.throws(()=>verifyBundle(result.dir));
   fs.renameSync(path.join(root,"hidden.md"),path.join(result.dir,"summary.md"));
   fs.writeFileSync(path.join(result.dir,"unexpected.txt"),"unauthorized");
   assert.throws(()=>verifyBundle(result.dir),/M4_BUNDLE_FILES_UNEXPECTED/);
   fs.rmSync(path.join(result.dir,"unexpected.txt"));
   assert.equal(verifyBundle(result.dir).ok,true);
   const bad=structuredClone(result.report);
   bad.limits.physicalValidated=true;
   assert.throws(()=>validateIntegrated(bad),/M4_INTEGRATED_REPORT_INVALID/);
   assert.deepEqual(buildTrace(result.report),result.trace);
   const forged=result.trace.map(x=>({...x}));
   forged[0].pass=false;
   assert.throws(()=>validateTrace(result.report,forged),/M4_TRACE_OR_REPORT_INCONSISTENT/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
