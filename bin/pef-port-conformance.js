#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runPredeviceConformance}=require("../src/runtime/predevice-conformance.js");
(async()=>{
 const args=process.argv.slice(2);
 if(args.length!==0&&!(args.length===2&&args[0]==="--output"&&path.isAbsolute(args[1])))
   throw Error("USAGE: node bin/pef-port-conformance.js [--output /absolute/evidence.json]");
 const result=await runPredeviceConformance(),json=JSON.stringify(result,null,2)+"\n";
 if(args.length)fs.writeFileSync(args[1],json,{mode:0o600});
 process.stdout.write(json);if(!result.ok)process.exitCode=1;
})().catch(e=>{process.stderr.write(String(e.message||e)+"\n");process.exitCode=1;});
