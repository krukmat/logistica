#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runJournalScale}=require("../src/runtime/arm64-f1-journal-scale.js");
(async()=>{
 let mode="smoke",profile="r28s-1g",baseDir,output,strict=false,ack;
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==="--mode")mode=args[++i];
  else if(arg==="--profile")profile=args[++i];
  else if(arg==="--base-dir")baseDir=args[++i];
  else if(arg==="--output")output=args[++i];
  else if(arg==="--require-constrained")strict=true;
  else if(arg==="--ack")ack=args[++i];
  else throw Error("F1_BAD_ARG:"+arg);
 }
 if((baseDir&&!path.isAbsolute(baseDir))||(output&&!path.isAbsolute(output)))
  throw Error("F1_PATH_MUST_BE_ABSOLUTE");
 const report=await runJournalScale({profile,mode,baseDir,ack,requireConstrained:strict,
  stageCallback:row=>console.error("F1_CHECKPOINT "+JSON.stringify(row))});
 if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report,null,2));
 if(!report.ok)process.exitCode=1;
})().catch(err=>{console.error("F1_BLOCKED:"+String(err.message||err));process.exitCode=1;});
