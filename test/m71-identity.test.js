"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {openM71SoftwareIdentity,verifyM71Proof}=require("../src/adapters/m71-identity-keystore.js");
const {runM71IdentitySmoke}=require("../src/runtime/m71-identity-smoke.js");
test("M7.1 Ed25519 software identity stays bound to site/device/revision, no regeneration",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m71-unit-"));
 const identity={siteId:"site-1",deviceId:"edge-1",configRevision:"v1"};
 try{
  const first=openM71SoftwareIdentity({dir:root,identity});
  assert.equal(first.created,true);
  const again=openM71SoftwareIdentity({dir:root,identity});
  assert.equal(again.created,false);
  assert.equal(first.keyId,again.keyId);
  const nonce="1".repeat(64),signed=again.prove(nonce);
  assert.equal(verifyM71Proof(signed,identity,again.publicKeyPem,nonce),true);
  assert.equal(verifyM71Proof(signed,identity,again.publicKeyPem,"2".repeat(64)),false);
  assert.equal(verifyM71Proof(signed,{...identity,siteId:"foreign"},again.publicKeyPem,nonce),false);
  const file=path.join(root,"pef-m71-identity-v1.json");
  fs.writeFileSync(file,"{}",{mode:0o600});
  assert.throws(()=>openM71SoftwareIdentity({dir:root,identity}),/M71_IDENTITY_MISMATCH/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("M7.1 actual local cryptographic smoke and negative probes",async()=>{
 const r=await runM71IdentitySmoke();
 assert.equal(r.status,"LAB_PASS",JSON.stringify(r));
 assert.equal(r.privateKeyInEvidence,false);
});
