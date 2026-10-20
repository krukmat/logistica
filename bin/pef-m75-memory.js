#!/usr/bin/env node
"use strict";
// Read-only local inspection of an operator-supplied M7.5 JSON report.
const fs=require("node:fs");
const {analyzeM75MemoryTrend}=require("../src/core/m75-memory-trend.js");
function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=="--report"||typeof args[1]!=="string"||
    !args[1])throw Error("M75_MEMORY_USAGE: npm run m7:memory -- --report /absolute/m75-report.json");
 const stat=fs.statSync(args[1]);
 if(!stat.isFile()||stat.size<2||stat.size>8388608)
  throw Error("M75_MEMORY_REPORT_SIZE_INVALID");
 const raw=fs.readFileSync(args[1],"utf8");
 // npm run without --silent prepends a lifecycle banner, so shell redirection
 // captures non-JSON text. Reject with a recoverable diagnostic, never guess
 // at a JSON substring and silently treat an altered report as evidence.
 if(/^\\s*>\\s*pef-virtual-edge@[^\\r\\n]+\\s+m7:sustained(?:\\r?\\n|$)/.test(raw))
  throw Error("M75_MEMORY_REPORT_CONTAINS_NPM_BANNER: preserve the original, then run: sed -n '/^{/,$p' input.json > clean.json ; npm run m7:memory -- --report clean.json. For future capture use npm run --silent m7:sustained.");
 let report;
 try{report=JSON.parse(raw);}
 catch{throw Error("M75_MEMORY_REPORT_NOT_JSON: check that the full M7.5.E JSON was captured; use npm run --silent m7:sustained for future runs.");}
 const analysis=analyzeM75MemoryTrend(report);
 console.log(JSON.stringify(analysis,null,2));
 if(analysis.status==="INVALID_EVIDENCE")process.exitCode=1;
}
try{main();}catch(e){
 console.error("M75_MEMORY_ANALYSIS_REJECTED:"+String(e.message||e));
 process.exitCode=1;
}
