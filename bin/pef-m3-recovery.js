#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runM3RecoverySmoke}=require("../src/emulator/lab/m3-recovery-smoke.js");
(async()=>{
 const args=process.argv.slice(2);
 if(args.length&&!(args.length===2&&args[0]==="--output"))throw Error("M3_RECOVERY_BAD_ARGS");
 const result=await runM3RecoverySmoke();
 if(args.length){
  const file=path.resolve(args[1]);fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+"."+process.pid+".tmp";
  try{fs.writeFileSync(tmp,JSON.stringify(result,null,2)+"\n",{mode:0o600});
    fs.renameSync(tmp,file);}finally{try{fs.unlinkSync(tmp);}catch(e){if(e.code!=="ENOENT")throw e;}}
 }
 console.log(JSON.stringify(result,null,2));
 if(result.ok!==true||result.status!=="LAB_PASS")process.exitCode=1;
})().catch(e=>{console.error("M3_RECOVERY_BLOCKED:"+String(e.message||e));process.exitCode=1;});
