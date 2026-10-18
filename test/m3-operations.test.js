"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {evaluateM3Diagnostics}=require("../src/core/m3-diagnostics.js");
const {createBundle,verifyBundle}=require("../src/runtime/m3-operations-bundle.js");
test("M3.5 pure diagnostic projection redacts unexpected sensitive event properties",()=>{
 const status={kind:"PEF_M3_MANAGER_STATUS_V1",phase:"SAFE_MODE",
  policyRevision:2,restartCount:1,missedReadinessChecks:0,
  policy:{maxRestarts:1},safeModeReason:"RESTART_BUDGET_EXHAUSTED",backend:"virtual-lab"};
 const d=evaluateM3Diagnostics(status,[{type:"SAFE_MODE_ENTERED",phase:"SAFE_MODE",
  at:"2026-10-18T10:00:00Z",token:"SECRET_UNSAFE",error:"SECRET_UNSAFE",
  reason:"RESTART_BUDGET_EXHAUSTED"}]);
 assert.equal(d.health,"INTERVENTION_REQUIRED");
 assert.equal(d.restartBudgetRemaining,0);
 assert.equal(d.operatorAction,"AUTHENTICATED_LOCAL_RECOVERY");
 assert.equal(JSON.stringify(d).includes("SECRET_UNSAFE"),false);
 assert.equal(d.remoteRecoveryAllowed,false);
});
test("M3.6 single real recovery run builds hashed report and rejects tampering",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m3-bundle-test-"));
 try{
  const run=await createBundle({outputRoot:root});
  const verified=verifyBundle(run.dir);
  assert.equal(verified.ok,true);
  assert.equal(verified.runId,run.report.runId);
  assert.equal(run.report.diagnostics[2].phase,"SAFE_MODE");
  const source=path.join(run.dir,"trace.ndjson");
  fs.appendFileSync(source,JSON.stringify({runId:'invalid',sequence:999,type:'FAKE'})+'\n');
  assert.throws(()=>verifyBundle(run.dir),/M3_/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
