#!/usr/bin/env node
"use strict";
const path=require("node:path");
const {createBundle,verifyBundle}=require("../src/runtime/m1-evidence-bundle.js");
(async()=>{
 const args=process.argv.slice(2);
 if(args[0]==="--verify"&&args[1]&&args.length===2){
  console.log(JSON.stringify(verifyBundle(path.resolve(args[1])),null,2));return;
 }
 if(args.length&&!(args.length===2&&args[0]==="--output-root"))
  throw Error("M1_INVALID_ARGS");
 const result=await createBundle({outputRoot:args.length?path.resolve(args[1]):path.resolve("artifacts/m1")});
 console.log(JSON.stringify({kind:"PEF_M1_EVIDENCE_CLI",ok:result.report.ok,
  status:result.report.status,dir:result.dir,runId:result.report.runId,
  verified:result.verification?.ok===true,error:result.report.error},null,2));
 if(!result.report.ok)process.exitCode=1;
})().catch(e=>{console.error("M1_BLOCKED:"+String(e.message||e));process.exitCode=1;});
