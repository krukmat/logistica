"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {planEnroll,findRegistered,checkedIdentity,MAX_DEVICES}=
 require("../src/core/cloud-lite-registry-policy.js");
const {digestCredential,createFileRegistryStore}=
 require("../src/adapters/cloud-lite-registry-file.js");
const {runM61RegistrySmoke}=require("../src/runtime/m61-registry-smoke.js");
test("M6.1 Core registry scopes reject unknown fields and duplicate identities",()=>{
 const scope={siteId:"s1",deviceId:"d1",configRevision:"r1"};
 assert.deepEqual(checkedIdentity(scope),scope);
 assert.throws(()=>checkedIdentity({...scope,admin:true}),/CLOUD_LITE_INVALID_IDENTITY_FIELDS/);
 assert.throws(()=>checkedIdentity({...scope,siteId:"../bad"}),/CLOUD_LITE_INVALID_IDENTITY/);
 assert.equal(planEnroll([],scope).ok,true);
 const record={...scope,credentialHash:"a".repeat(64)};
 assert.equal(planEnroll([record],scope).error,"DEVICE_ALREADY_ENROLLED");
 assert.equal(findRegistered([record],scope).credentialHash,record.credentialHash);
 assert.equal(findRegistered([record],{...scope,configRevision:"r2"}),null);
 assert.equal(MAX_DEVICES,128);
});
test("M6.1 file registry rejects unsupported paths and malformed persisted state",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m61-unit-"));
 try{
  assert.throws(()=>createFileRegistryStore({dir:process.cwd()}),/CLOUD_LITE_TEMP_LAB_ONLY/);
  const store=createFileRegistryStore({dir:root});
  assert.deepEqual(store.read(),[]);
  assert.equal(digestCredential("0".repeat(64)).length,64);
  assert.equal(digestCredential("not-a-token"),null);
  store.append({siteId:"s1",deviceId:"d1",configRevision:"r1",
    credentialHash:digestCredential("f".repeat(64))});
  assert.throws(()=>store.append({siteId:"s1",deviceId:"d1",configRevision:"r1",
    credentialHash:"a".repeat(64)}),/DEVICE_ALREADY_ENROLLED/);
  store.close();
  const filename=path.join(root,"pef-cloud-lite-registry-v1.json");
  assert.deepEqual(createFileRegistryStore({dir:root}).read().map(x=>x.deviceId),["d1"]);
  // An interrupted writer must fail closed on a corrupted registry.
  fs.writeFileSync(filename,"{broken json\n",{mode:0o600});
  assert.throws(()=>createFileRegistryStore({dir:root}),/CLOUD_LITE_REGISTRY_CORRUPT/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("M6.1 actual HTTP registry persists hashed device tokens across restart and rejects spoofing",async()=>{
 const result=await runM61RegistrySmoke();
 assert.equal(result.status,"LAB_PASS",JSON.stringify(result));
 assert.equal(Object.values(result.checks).every(Boolean),true);
 assert.equal(result.eventIngestionAvailable,false);
 assert.equal(result.cloudMockReplaced,false);
});
