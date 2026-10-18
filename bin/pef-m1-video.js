#!/usr/bin/env node
"use strict";
const path=require("node:path");
const {createBundle}=require("../src/runtime/m1-evidence-bundle.js");
const {recordVideo,verifyVideo}=require("../src/runtime/m1-video.js");
(async()=>{
 const args=process.argv.slice(2);
 if(args.length===2&&args[0]==="--verify"){
  console.log(JSON.stringify(verifyVideo(path.resolve(args[1])),null,2));return;
 }
 if(args.length&&!(args.length===2&&args[0]==="--dir"))throw Error("M1_VIDEO_INVALID_ARGS");
 const dir=args.length?path.resolve(args[1]):
  (await createBundle({outputRoot:path.resolve("artifacts/m1")})).dir;
 const result=await recordVideo(dir);
 console.log(JSON.stringify({dir,...result},null,2));
})().catch(e=>{console.error("M1_VIDEO_BLOCKED:"+String(e.message||e));process.exitCode=1;});
