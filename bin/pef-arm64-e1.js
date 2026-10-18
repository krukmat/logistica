#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runResourceEnvelope}=require("../src/runtime/arm64-resource-envelope.js");
(async()=>{
 const a=process.argv.slice(2);let profile="r28s-1g",output=null,strict=false;
 for(let i=0;i<a.length;i++){if(a[i]==="--profile")profile=a[++i];
 else if(a[i]==="--output")output=a[++i];
 else if(a[i]==="--strict")strict=true;
 else throw Error("E1_UNKNOWN_ARGUMENT");}
 if(output&&!path.isAbsolute(output))throw Error("E1_ABSOLUTE_OUTPUT_REQUIRED");
 const r=await runResourceEnvelope({profile,requireConstrained:strict});
 if(output)fs.writeFileSync(output,JSON.stringify(r,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
})().catch(e=>{console.error("E1_BLOCKED:"+String(e.message||e));process.exitCode=1;});
