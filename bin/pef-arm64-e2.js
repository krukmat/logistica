#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runOfflineEnvelope}=require("../src/runtime/arm64-offline-envelope.js");
(async()=>{
 const a=process.argv.slice(2);let profile="r28s-1g",count=1000,payloadKiB=1,baseDir,output,strict=false;
 for(let i=0;i<a.length;i++){const x=a[i];
 if(x==="--profile")profile=a[++i];else if(x==="--count")count=Number(a[++i]);
 else if(x==="--payload-kib")payloadKiB=Number(a[++i]);
 else if(x==="--base-dir")baseDir=a[++i];else if(x==="--output")output=a[++i];
 else if(x==="--strict")strict=true;else throw Error("E2_UNKNOWN_ARG");}
 if((baseDir&&!path.isAbsolute(baseDir))||(output&&!path.isAbsolute(output)))
   throw Error("E2_ABSOLUTE_PATH_REQUIRED");
 const r=await runOfflineEnvelope({profile,count,payloadKiB,baseDir,requireConstrained:strict});
 if(output)fs.writeFileSync(output,JSON.stringify(r,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
})().catch(e=>{console.error("E2_BLOCKED:"+String(e.message||e));process.exitCode=1;});
