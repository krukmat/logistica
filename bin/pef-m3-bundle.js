#!/usr/bin/env node
"use strict";
const path=require("node:path");
const {createBundle,verifyBundle,recordVideo,verifyVideo}=
 require("../src/runtime/m3-operations-bundle.js");
(async()=>{
 const [cmd,arg,...rest]=process.argv.slice(2);
 if(rest.length)throw Error("M3_BUNDLE_INVALID_ARGS");
 if(cmd==="--verify"&&arg)return console.log(JSON.stringify(verifyBundle(path.resolve(arg)),null,2));
 if(cmd==="--verify-video"&&arg)return console.log(JSON.stringify(verifyVideo(path.resolve(arg)),null,2));
 if(cmd==="--video"&&arg)return console.log(JSON.stringify(await recordVideo(path.resolve(arg)),null,2));
 if(cmd!==undefined&&cmd!=="--output-root")throw Error("M3_BUNDLE_INVALID_ARGS");
 if(cmd==="--output-root"&&!arg)throw Error("M3_BUNDLE_ROOT_REQUIRED");
 const run=await createBundle({outputRoot:path.resolve(arg||"artifacts/m3")});
 console.log(JSON.stringify({kind:"PEF_M3_BUNDLE_CLI",ok:true,dir:run.dir,
  runId:run.report.runId,verification:run.verification},null,2));
})().catch(e=>{console.error("M3_BUNDLE_BLOCKED:"+String(e.message||e));process.exitCode=1;});
