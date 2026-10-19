"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {VERSION,signCloudLiteAck,verifyCloudLiteAck}=require("../src/adapters/cloud-lite-ack-proof.js");
const {createCloudLiteHttpTransport}=require("../src/adapters/cloud-lite-http-transport.js");
const token="a".repeat(64);
test("M6.3 local ACK proof binds digest identity and duplicate flag",()=>{
 const ack={protocolVersion:VERSION,eventId:"e1",sha256:"b".repeat(64),
   siteId:"s1",deviceId:"d1",duplicate:false};
 const signed={...ack,labProof:signCloudLiteAck(ack,token)};
 assert.equal(verifyCloudLiteAck(signed,token),true);
 for(const mutation of [{deviceId:"d2"},{eventId:"wrong"},{duplicate:true},
   {sha256:"c".repeat(64)},{protocolVersion:2},{labProof:"0".repeat(64)}])
  assert.equal(verifyCloudLiteAck({...signed,...mutation},token),false);
});
test("M6.3 transport denies remote URLs, non-TLS WAN and malformed config",()=>{
 for(const baseUrl of ["https://example.com:443","http://example.com:8080",
   "http://127.0.0.1:8080/admin","http://localhost:8080",
   "http://127.0.0.1:8080/?bad=yes","file:///tmp/foo"]){
  assert.throws(()=>createCloudLiteHttpTransport({baseUrl,deviceToken:token}),
    /CLOUD_LITE_/);
 }
 const adapter=createCloudLiteHttpTransport({baseUrl:"http://127.0.0.1:8080",deviceToken:token});
 assert.equal(adapter.scope,"LOOPBACK_ONLY");
 assert.equal(adapter.verifyAck({}),false);
});
