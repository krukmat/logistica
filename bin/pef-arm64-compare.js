#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {compareArm64Evidence}=require("../src/runtime/arm64-lab-compare.js");
try{
 let profile="r28s-1g",corePath,networkPath,recoveryPath,loadPath,output;
 const a=process.argv.slice(2);
 for(let i=0;i<a.length;i++){
  const k=a[i],v=a[++i];
  if(k==="--profile")profile=v;else if(k==="--core")corePath=v;
  else if(k==="--network")networkPath=v;else if(k==="--recovery")recoveryPath=v;
  else if(k==="--load")loadPath=v;else if(k==="--output")output=v;
  else throw Error("D4_UNKNOWN_ARG");
 }
 if(!corePath||!networkPath||!recoveryPath||!loadPath||
    [corePath,networkPath,recoveryPath,loadPath].some(p=>!path.isAbsolute(p))||
    output&&!path.isAbsolute(output))throw Error("D4_REQUIRE_ABSOLUTE_INPUT_PATHS");
 const parse=p=>{
  if(fs.statSync(p).size>131072)throw Error("D4_EVIDENCE_TOO_LARGE");
  return JSON.parse(fs.readFileSync(p,"utf8"));
 };
 const result=compareArm64Evidence({profile,core:parse(corePath),network:parse(networkPath),
   recovery:parse(recoveryPath),load:parse(loadPath)});
 if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(!result.ok)process.exitCode=1;
}catch(e){console.error("D4_BLOCKED:"+String(e.message||e));process.exitCode=1;}
