"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createVerifiedRoutePorts}=require("../src/adapters/verified-route-ports.js");
const {createScriptedWanPorts}=require("../src/adapters/scripted-wan-ports.js");
const {runVerifiedRouteConformance}=require("../src/runtime/verified-route-conformance.js");
test("W1.10.B1 partial kernel-like route changes roll back or quarantine without Core commit",async()=>{
 const checks=await runVerifiedRouteConformance();
 assert.equal(checks.length,4);
 assert.deepEqual(checks.map(x=>x.id),[
  "PORT_PARTIAL_ROUTE_ROLLBACK","PORT_ROUTE_POSTCHECK_REJECTS_FALSE_SUCCESS",
  "PORT_UNCERTAIN_ROUTE_QUARANTINE","PORT_EXPLICIT_ROUTE_RECONCILIATION"]);
 assert.ok(checks.every(x=>x.pass),JSON.stringify(checks));
});
test("route verification rejects missing readback and cannot clear quarantine with wrong OS state",async()=>{
 assert.throws(()=>createVerifiedRoutePorts({probe:async()=>{},applyRoute:async()=>{}}),/VERIFIED_ROUTE_PORTS_REQUIRED/);
 const raw=createScriptedWanPorts(),ports=createVerifiedRoutePorts(raw);
 await ports.applyRoute("primary");
 raw.failNextRouteAfterMutation({rollbackFails:true});
 await assert.rejects(ports.applyRoute("backup"),/ROUTE_UNCERTAIN_RECONCILIATION_REQUIRED/);
 assert.equal(await ports.reconcile("primary"),false);
 await assert.rejects(ports.applyRoute(null),/ROUTE_RECONCILIATION_REQUIRED/);
 raw.simulateOperatorRouteRepair("primary");
 assert.equal(await ports.reconcile("primary"),true);
 await ports.applyRoute("backup");
 assert.equal(raw.snapshot().route,"backup");
});
