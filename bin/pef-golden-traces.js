#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runGoldenTraces,compareReports}=require("../src/runtime/golden-traces.js");
(async()=>{
 const args=process.argv.slice(2);let output=null,compare=null;
 for(let i=0;i<args.length;i+=2){
   if(!["--output","--compare"].includes(args[i])||!args[i+1]||!path.isAbsolute(args[i+1]))
     throw Error("USAGE: node bin/pef-golden-traces.js [--output /absolute/report.json] [--compare /absolute/other.json]");
   if(args[i]==="--output"){if(output)throw Error("DUPLICATE_OUTPUT_ARG");output=args[i+1];}
   else{if(compare)throw Error("DUPLICATE_COMPARE_ARG");compare=args[i+1];}
 }
 const result=await runGoldenTraces();
 if(compare)result.crossEnvironment=compareReports(result,JSON.parse(fs.readFileSync(compare,"utf8")));
 const json=JSON.stringify(result,null,2)+"\n";
 if(output)fs.writeFileSync(output,json,{mode:0o600});
 process.stdout.write(json);
 if(!result.ok||result.crossEnvironment?.ok===false)process.exitCode=1;
})().catch(e=>{process.stderr.write(String(e.message||e)+"\n");process.exitCode=1;});
