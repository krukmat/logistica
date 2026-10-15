"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runGoldenTraces,compareTraces,compareReports}=require("../src/runtime/golden-traces.js");
const fixture=require("../docs/contracts/golden-traces-v1.json");
test("B4 pinned Core trace includes WAN failover, offline receipt replay, route quarantine and fsync ambiguity",async()=>{
 const report=await runGoldenTraces();
 assert.equal(report.ok,true,JSON.stringify(report.comparison.differences));
 assert.deepEqual(report.traces.scenarios.map(s=>s.id),fixture.scenarios.map(s=>s.id));
 assert.equal(report.canonicalSha256,report.baselineSha256);
 assert.equal(report.metrics.comparable,false);
 assert.equal(report.metrics.watts,null);
 assert.equal(report.physicalValidated,false);
});
test("B4 strictly detects altered route, ACK, omitted step or additional scenario",async()=>{
 const report=await runGoldenTraces();
 const clone=()=>structuredClone(report.traces.scenarios);
 let wrong=clone();wrong[0].trace[1].selectedWan="primary";
 assert.equal(compareTraces(wrong).ok,false);
 assert.ok(compareTraces(wrong).differences.some(x=>x.path.includes("selectedWan")));
 wrong=clone();wrong[1].trace[1].fsync=false;
 assert.equal(compareTraces(wrong).ok,false);
 wrong=clone();wrong[2].trace.pop();
 assert.equal(compareTraces(wrong).ok,false);
 wrong=clone();wrong.push({id:"injected",trace:[]});
 assert.equal(compareTraces(wrong).ok,false);
});
test("B4 cross-host comparison requires both traces match pinned reference, not wall times",async()=>{
 const local=await runGoldenTraces(),external=structuredClone(local);
 external.metrics.platform="darwin";
 external.metrics.observations[0].wallMs=99999;
 assert.equal(compareReports(local,external).ok,true);
 external.traces.scenarios[2].trace[1].quarantined=false;
 assert.equal(compareReports(local,external).ok,false);
 assert.throws(()=>compareReports(local,{kind:"bad"}),/INVALID_GOLDEN_REPORT/);
});
