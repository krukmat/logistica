"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runDeviceIntegrationRehearsal}=require("../src/runtime/device-integration-rehearsal.js");
const {inspectDeviceDriverShape,assessDeviceReadiness}=require("../src/runtime/device-preflight.js");
const {writeLabBootIntent,readLabBootIntent}=require("../src/runtime/device-boot-intent.js");
const contract=require("../docs/contracts/device-integration-v1.json");
test("W1.10.C1 simulator-first hardware integration contract and boot rehearsal",async()=>{
 const report=await runDeviceIntegrationRehearsal();
 assert.equal(report.status,"LAB_PASS",JSON.stringify(report.checks.filter(x=>!x.pass)));
 assert.deepEqual(report.checks.map(x=>x.id),contract.labChecks);
 assert.equal(report.passed,9);
 assert.equal(report.device.status,"DEVICE_BLOCKED");
 assert.equal(report.onDeviceExecuted,false);
 assert.equal(report.provisioningPerformed,false);
 assert.equal(report.hostRoutesChanged,false);
});
test("W1.10.C1 malformed or self-asserted prerequisites never authorize a device",()=>{
 assert.throws(()=>assessDeviceReadiness({claims:{"INVENTED":"DEVICE_PASS"}}),/C1_INVALID_EVIDENCE_CLAIMS/);
 assert.throws(()=>assessDeviceReadiness({claims:{"C1_TRUST_PKI":true}}),/C1_INVALID_EVIDENCE_CLAIMS/);
 const claims=Object.fromEntries(contract.requirements.map(x=>[x.id,"DEVICE_PASS"]));
 const report=assessDeviceReadiness({claims});
 assert.equal(report.status,"DEVICE_BLOCKED");
 assert.equal(report.productionAuthorized,false);
 assert.equal(report.deviceBackendEnabled,false);
 assert.ok(report.requirements.every(x=>x.verified===false));
 assert.equal(inspectDeviceDriverShape({}).ok,false);
 assert.throws(()=>readLabBootIntent({journal:null}),/C1_JOURNAL_REQUIRED/);
 assert.throws(()=>writeLabBootIntent({journal:{append(){},retained(){return [];}},
   identity:{siteId:"x",deviceId:"y",configRevision:"r"},expectedRoute:"other"}),/C1_INVALID_BOOT_ROUTE/);
});
