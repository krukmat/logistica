#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runM3LifecycleSmoke}=require("../src/emulator/lab/m3-lifecycle-smoke.js");
(async()=>{
 const args=process.argv.slice(2);
 if(args.length&&!(args.length===2&&args[0]==="--output"))throw Error("M3_EVIDENCE_INVALID_ARGS");
 const evidence=await runM3LifecycleSmoke();
 if(args.length){
  const file=path.resolve(args[1]),parent=path.dirname(file);
  fs.mkdirSync(parent,{recursive:true});
  const temp=file+".tmp."+process.pid;
  try{fs.writeFileSync(temp,JSON.stringify(evidence,null,2)+"\n",{mode:0o600});
    fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 }
 console.log(JSON.stringify(evidence,null,2));
 if(!evidence.ok||evidence.status!=="LAB_PASS")process.exitCode=1;
})().catch(e=>{console.error("M3_EVIDENCE_BLOCKED:"+String(e.message||e));process.exitCode=1;});
