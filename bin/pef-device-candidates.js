#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runCandidateScreening}=require("../src/runtime/device-candidate-screen.js");
try{
 const a=process.argv.slice(2);
 if(a.length!==0&&!(a.length===2&&a[0]==="--output"&&path.isAbsolute(a[1])))
   throw Error("USAGE: npm run device:candidates -- [--output /absolute/report.json]");
 const report=runCandidateScreening();
 const json=JSON.stringify(report,null,2)+"\n";
 if(a.length)fs.writeFileSync(a[1],json,{mode:0o600});
 process.stdout.write(json);
 if(!report.ok)process.exitCode=1;
}catch(e){process.stderr.write(String(e.message||e)+"\n");process.exitCode=1;}
