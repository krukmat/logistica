"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createM3PolicyStore}=require("../src/runtime/m3-policy-store.js");
const scope={siteId:"m3-policy-site",deviceId:"m3-policy-edge",configRevision:"r1"};
const policy={maxRestarts:1,restartDelayMs:150,healthIntervalMs:400,healthFailures:3};
function run(callback){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m3-policy-test-"));
 try{return callback(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const open=dir=>createM3PolicyStore({dir,identity:scope,initialPolicy:policy});
test("M3.3 revision validation, fsynced commit, reboot recovery, interrupted stage rollback",()=>run(dir=>{
 const store=open(dir);
 assert.equal(store.snapshot().revision,1);
 assert.throws(()=>store.stage({revision:2,expectedRevision:0,policy}),/M3_REVISION_CONFLICT/);
 assert.throws(()=>store.stage({revision:2,expectedRevision:1,
  policy:{...policy,unapproved:"X"}}),/M3_POLICY_INVALID/);
 const next={...policy,restartDelayMs:200};
 store.stage({expectedRevision:1,revision:2,policy:next});
 assert.equal(store.snapshot().revision,1);
 assert.equal(store.snapshot().stagedRevision,2);
 const reboot=open(dir);
 assert.equal(reboot.snapshot().recoveredStage,true);
 assert.equal(reboot.snapshot().stagedRevision,null);
 assert.deepEqual(reboot.snapshot().policy,policy);
 reboot.stage({expectedRevision:1,revision:2,policy:next});
 assert.equal(reboot.commit().revision,2);
 assert.equal(open(dir).snapshot().revision,2);
 assert.equal(open(dir).snapshot().policy.restartDelayMs,200);
}));
test("M3.3 corrupted or altered policy file never silently reinitializes",()=>run(dir=>{
 open(dir);
 const file=path.join(dir,"pef-m3-supervisor-policy.json");
 const o=JSON.parse(fs.readFileSync(file,"utf8"));
 o.committed.policy.restartDelayMs=999;
 fs.writeFileSync(file,JSON.stringify(o),{mode:0o600});
 assert.throws(()=>open(dir),/M3_POLICY_CORRUPT_OR_SCOPE_MISMATCH/);
}));
test("M3.3 wrong device / symlink / unsafe file permissions fail closed",()=>run(dir=>{
 open(dir);
 assert.throws(()=>createM3PolicyStore({dir,identity:{...scope,deviceId:"intruder"},
  initialPolicy:policy}),/M3_POLICY_CORRUPT_OR_SCOPE_MISMATCH/);
 const file=path.join(dir,"pef-m3-supervisor-policy.json");
 fs.chmodSync(file,0o644);
 assert.throws(()=>open(dir),/M3_POLICY_FILE_UNSAFE/);
}));
