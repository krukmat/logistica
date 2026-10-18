"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {renderViewer}=require("../src/runtime/m1-evidence-viewer.js");
const report={kind:"PEF_M1_END_TO_END_EVIDENCE_V1",runId:"abc",commit:"f".repeat(40),
 status:"M1_FUNCTIONAL_LAB_PASS",profile:{platform:"linux",arch:"arm64"}};
test("M1 evidence viewer is static/real report only; no physical GO, XSS escaped",()=>{
 const html=renderViewer(report,[{runId:"abc",id:"M1_STAGE",pass:true,
  data:{payload:"<script>alert(1)</script>",actual:"LOCAL_ONLY"}}]);
 assert.match(html,/data-run-id="abc"/);
 assert.match(html,/WAN VIRTUAL/);
 assert.match(html,/CLOUD MOCK/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/LOCAL_ONLY/);
 assert.throws(()=>renderViewer(report,[{runId:"different",data:{}}]),
  /M1_VISUAL_MISMATCHED_REPORT_TRACE/);
});
