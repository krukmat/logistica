#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const {runM76PilotGate}=require("../src/runtime/m76-pilot-gate.js");
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==0&&(args.length!==2||args[0]!=="--evidence"))
  throw Error("M76_USAGE: npm run m7:pilot -- [--evidence /absolute/m75-long-soak.json]");
 let operatorEvidence=null;
 if(args.length){
  const file=args[1];
  if(!fs.statSync(file).isFile()||fs.statSync(file).size>48000)
   throw Error("M76_EVIDENCE_FILE_INVALID_OR_TOO_LARGE");
  operatorEvidence=JSON.parse(fs.readFileSync(file,"utf8"));
 }
 const result=await runM76PilotGate({operatorEvidence});
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}
main().catch(e=>{console.error("M76_PILOT_GATE_FAILED:"+String(e.stack||e));process.exitCode=1;});
