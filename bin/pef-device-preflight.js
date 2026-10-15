#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runDeviceIntegrationRehearsal}=require("../src/runtime/device-integration-rehearsal.js");
(async()=>{
 const args=process.argv.slice(2);
 if(args.length!==0&&!(args.length===2&&args[0]==="--output"&&path.isAbsolute(args[1])))
   throw Error("USAGE: node bin/pef-device-preflight.js [--output /absolute/report.json]");
 const report=await runDeviceIntegrationRehearsal();
 const result=JSON.stringify(report,null,2)+"\n";
 if(args.length)fs.writeFileSync(args[1],result,{mode:0o600});
 process.stdout.write(result);
 if(!report.ok)process.exitCode=1;
})().catch(e=>{process.stderr.write(String(e.message||e)+"\n");process.exitCode=1;});
