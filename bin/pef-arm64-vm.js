#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runArm64VmProfile}=require("../src/runtime/arm64-vm-profile.js");
(async()=>{
 const args=process.argv.slice(2);let profile="r28s-1g",count=50,baseDir,output,requireArm64=false,enforceGuestLimits=false;
 for(let i=0;i<args.length;i++){
   const x=args[i];
   if(x==="--profile")profile=args[++i];
   else if(x==="--count")count=Number(args[++i]);
   else if(x==="--base-dir")baseDir=args[++i];
   else if(x==="--output")output=args[++i];
   else if(x==="--require-arm64")requireArm64=true;
   else if(x==="--enforce-guest-limits")enforceGuestLimits=true;
   else throw Error("UNKNOWN_ARG:"+x);
 }
 if(output&&!path.isAbsolute(output))throw Error("OUTPUT_ABSOLUTE_PATH_REQUIRED");
 if(baseDir&&!path.isAbsolute(baseDir))throw Error("BASE_DIR_ABSOLUTE_PATH_REQUIRED");
 const r=await runArm64VmProfile({profile,count,baseDir,requireArm64,enforceGuestLimits});
 if(output)fs.writeFileSync(output,JSON.stringify(r,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
})().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
