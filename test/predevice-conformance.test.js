"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createScriptedWanPorts}=require("../src/adapters/scripted-wan-ports.js");
const {runPredeviceConformance}=require("../src/runtime/predevice-conformance.js");
const contract=require("../docs/contracts/predevice-ports-v1.json");
test("W1.10.A + B1 real Core passes 34 predevice port conformance cases",async()=>{
 const report=await runPredeviceConformance();
 assert.equal(report.status,"LAB_PASS",JSON.stringify(report.checks.filter(x=>!x.pass)));
 assert.equal(report.total,contract.assertions.length);
 assert.deepEqual(report.checks.map(x=>x.id),contract.assertions);
 assert.equal(report.passed,34);
 assert.equal(report.physicalValidated,false);
 assert.equal(report.hostRoutesChanged,false);
 assert.equal(report.deviceBackend,"BACKEND_NOT_IMPLEMENTED");
});
test("scripted ports refuse malformed writes and keep applied route after failure",async()=>{
 const ports=createScriptedWanPorts();
 assert.throws(()=>ports.setWan("other",{upstream:false}),/UNKNOWN_WAN_ID/);
 assert.throws(()=>ports.setWan("primary",{upstream:1}),/INVALID_SCRIPTED_WAN_CHANGE/);
 await assert.rejects(ports.applyRoute("other"),/INVALID_ROUTE_TARGET/);
 await ports.applyRoute("primary");ports.failNextRoute();
 await assert.rejects(ports.applyRoute("backup"),/INJECTED_ROUTE_FAILURE/);
 assert.equal(ports.snapshot().route,"primary");
 assert.equal(ports.snapshot().hostRoutesChanged,false);
 ports.failNextProbe("backup","io-error");
 await assert.rejects(ports.probe("backup"),/INJECTED_PROBE_IO_ERROR/);
});
