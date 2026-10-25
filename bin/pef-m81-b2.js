#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const {createM81B2Plan,inspectM81B2Evidence}=require("../src/runtime/m81-b2-plan.js");
async function main(){
 const argv=process.argv.slice(2);
 if(argv.length===1&&argv[0]==="--plan"){
  process.stdout.write(JSON.stringify(createM81B2Plan(),null,2)+"\n");return;
 }
 if(argv.length===2&&argv[0]==="--inspect"){
  const stat=fs.lstatSync(argv[1]);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>32768)
   throw Error("M81_B2_REPORT_FILE_INVALID");
  const evidence=JSON.parse(fs.readFileSync(argv[1],"utf8"));
  process.stdout.write(JSON.stringify(inspectM81B2Evidence(evidence),null,2)+"\n");return;
 }
 if(argv.length===4&&argv[0]==="--run"){
  if(process.env.PEF_M81_B2_ACK!=="EXPLICIT_VM_ROOT_SANDBOX_M81B2")
   throw Error("M81_B2_OPERATOR_ACK_REQUIRED");
  const {runM81B2GuestStack}=require("../src/runtime/m81-b2-guest-stack.js");
  const result=await runM81B2GuestStack({base:argv[1],propertyNamespace:argv[2],
    hostNamespace:argv[3]});
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(!result.ok)process.exitCode=1;
  return;
 }
 throw Error("M81_B2_USAGE: --plan | --inspect <json> | --run <base> <propertyNS> <hostNS>");
}
main().catch(e=>{console.error("M81_B2_BLOCKED:"+String(e.stack||e));process.exitCode=78;});
