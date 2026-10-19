"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createM73MtlsTransport}=require("../src/adapters/m73-mtls-transport.js");
const {runM73MtlsSmoke}=require("../src/runtime/m73-mtls-smoke.js");
test("M7.3 secure transport rejects plain HTTP and non-loopback endpoints",()=>{
 const material={ca:Buffer.from("ca"),cert:Buffer.from("cert"),key:Buffer.from("key"),
   deviceToken:"a".repeat(64)};
 for(const url of ["http://127.0.0.1:1001","https://cloud.example.com",
   "https://127.0.0.1:999/path","https://user:pass@127.0.0.1:999"]){
  assert.throws(()=>createM73MtlsTransport({baseUrl:url,...material}),/M73_/);
 }
});
test("M7.3 real TLS1.3 mutual certificates, Device/Host SAN scopes and offline Edge",async()=>{
 const report=await runM73MtlsSmoke();
 assert.equal(report.status,"LAB_PASS",JSON.stringify(report));
 assert.equal(report.checks.MUTUAL_CERT_REQUIRED,true);
 assert.equal(report.checks.UNTRUSTED_CA_REJECTED,true);
 assert.equal(report.profiles.property.CERT_SCOPE_BOUND_TO_DEVICE,true);
 assert.equal(report.profiles.host.AUTHENTICATED_MTLS_RECONCILIATION,true);
 assert.equal(report.deviceKeySameAsM71,false);
});
