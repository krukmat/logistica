"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runBoundedPortConformance}=require("../src/runtime/bounded-port-conformance.js");
const {createBoundedWanPorts}=require("../src/adapters/bounded-wan-ports.js");
const {createScriptedWanPorts}=require("../src/adapters/scripted-wan-ports.js");
test("W1.10.B2 timeout, abort, late route completion and boot reconciliation matrix",async()=>{
 const checks=await runBoundedPortConformance();
 const names=["PORT_BOOT_ROUTE_RECONCILIATION","PORT_PROBE_DEADLINE_NO_COMMIT",
   "PORT_LATE_ROUTE_QUARANTINE","PORT_LATE_COMMIT_REQUIRES_REPAIR",
   "PORT_COOPERATIVE_ABORT_RECHECK","PORT_HUNG_ROUTE_REMAINS_BLOCKED"];
 assert.deepEqual(checks.map(x=>x.id),names);
 assert.ok(checks.every(x=>x.pass),JSON.stringify(checks.filter(x=>!x.pass)));
});
test("bounded ports reject invalid deadlines and unknown route targets",async()=>{
 const raw=createScriptedWanPorts();
 assert.throws(()=>createBoundedWanPorts(raw,{probeTimeoutMs:0}),/INVALID_PORT_DEADLINE/);
 const ports=createBoundedWanPorts(raw);
 await assert.rejects(ports.applyRoute("third"),/INVALID_ROUTE_TARGET/);
 await assert.rejects(ports.reconcile("third"),/INVALID_ROUTE_TARGET/);
 assert.equal(ports.status().bootReconciled,false);
 assert.equal(await ports.reconcile(null),true);
 assert.equal(ports.status().bootReconciled,true);
});
