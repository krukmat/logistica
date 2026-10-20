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
 const report=JSON.parse(fs.readFileSync(args[1],"utf8"));
 const analysis=analyzeM75MemoryTrend(report);
 console.log(JSON.stringify(analysis,null,2));
 if(analysis.status==="INVALID_EVIDENCE")process.exitCode=1;
}
try{main();}catch(e){
 console.error("M75_MEMORY_ANALYSIS_REJECTED:"+String(e.message||e));
 process.exitCode=1;
}
