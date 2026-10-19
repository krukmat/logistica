#!/usr/bin/env node
"use strict";
const path=require("node:path");
const {createBundle,verifyBundle}=require("../src/runtime/m4-evidence-bundle.js");
(async()=>{
 const args=process.argv.slice(2);
 if(args[0]==="--verify"&&args.length===2){
   console.log(JSON.stringify(verifyBundle(path.resolve(args[1])),null,2));return;
 }
 if(args.length>2||args.length===1&&args[0]!=="--output-root"||
   args.length===2&&args[0]!=="--output-root"||
   args[0]==="--output-root"&&args.length!==2)
   throw Error("M4_BUNDLE_INVALID_ARGS");
 const out=path.resolve(args[1]||"artifacts/m4");
 const run=await createBundle({outputRoot:out});
 console.log(JSON.stringify({kind:"PEF_M4_BUNDLE_CLI_V1",ok:true,dir:run.dir,
   runId:run.report.runId,verification:run.verification},null,2));
})().catch(e=>{console.error("M4_BUNDLE_BLOCKED:"+String(e.message||e));process.exitCode=1;});
