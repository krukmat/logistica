"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {nextInstallState,validVersion}=require("../src/core/install-policy.js");
const {applyRelease,verifyInstall}=require("../src/runtime/m5-install.js");
const {runM5InstallSmoke}=require("../src/runtime/m5-install-smoke.js");
test("M5.1 pure policy enforces active version, rollback and immutable names",()=>{
 const hash="a".repeat(64),other="b".repeat(64);
 assert.equal(validVersion("../bad"),false);
 assert.throws(()=>nextInstallState(null,"../bad",hash,"install"),/M5_INVALID_RELEASE/);
 const first=nextInstallState(null,"v1",hash,"install");
 assert.equal(first.state.activeVersion,"v1");
 const second=nextInstallState(first.state,"v2",other,"upgrade");
 assert.equal(second.state.previousVersion,"v1");
 assert.throws(()=>nextInstallState(second.state,"v3",hash,"rollback"),/M5_ROLLBACK_TARGET_DENIED/);
 assert.equal(nextInstallState(second.state,"v1",hash,"rollback").state.previousVersion,"v2");
 assert.equal(nextInstallState(first.state,"v1",hash,"upgrade").changed,false);
 assert.throws(()=>nextInstallState(first.state,"v1",other,"upgrade"),/M5_VERSION_IMMUTABLE/);
});
test("M5.1 install verification refuses a corrupted active release",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m5-unit-"));
 try{
   const first=applyRelease({root:dir,version:"m5-test",mode:"install"});
   assert.equal(verifyInstall(dir).digest,first.digest);
   const file=path.join(dir,"releases","m5-test","bin","pef-edge.js");
   fs.appendFileSync(file,"\n// corrupt\n");
   assert.throws(()=>verifyInstall(dir),/M5_RELEASE_DIGEST_MISMATCH/);
   assert.throws(()=>applyRelease({root:dir,version:"m5-next",mode:"upgrade"}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("M5.2 real packaged Node subprocess: install, fsync, update, fault, reopen, rollback",async()=>{
 const report=await runM5InstallSmoke();
 assert.equal(report.status,"LAB_PASS",JSON.stringify(report));
 assert.equal(Object.values(report.checks).every(Boolean),true);
 assert.equal(report.observed.length,2);
 assert.equal(report.physicalValidated,false);
 assert.equal(report.systemdActivated,false);
});

test("M5.1 rejects symlinked installation tree and release/data paths",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m5-symlink-"));
 const external=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m5-external-"));
 try{
   fs.symlinkSync(external,path.join(root,"link"));
   assert.throws(()=>applyRelease({root:path.join(root,"link","nested"),version:"r1",mode:"install"}),/M5_UNSAFE_ROOT/);
   assert.equal(fs.existsSync(path.join(external,"nested")),false);
   fs.symlinkSync(external,path.join(root,"releases"));
   assert.throws(()=>applyRelease({root,version:"r1",mode:"install"}),/M5_RELEASE_ROOT_UNSAFE/);
   fs.unlinkSync(path.join(root,"releases"));
   fs.symlinkSync(external,path.join(root,"data"));
   assert.throws(()=>applyRelease({root,version:"r1",mode:"install"}),/M5_DATA_DIR_UNSAFE/);
   assert.equal(fs.existsSync(path.join(root,"state.json")),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(external,{recursive:true,force:true});}
});
