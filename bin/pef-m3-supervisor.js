#!/usr/bin/env node
"use strict";
const path=require("node:path");
const {createManagedEdge}=require("../src/runtime/m3-process-manager.js");
async function main(args){
 if(args.includes("--help")){
  console.log("Usage: PEF_EDGE_TOKEN=<secret> node bin/pef-m3-supervisor.js --config /absolute/config.json");
  return;
 }
 if(args.length!==2||args[0]!=="--config")throw Error("M3_CONFIG_REQUIRED");
 const manager=createManagedEdge({
  configFile:path.resolve(args[1]),token:process.env.PEF_EDGE_TOKEN,
  onEvent:event=>console.log(JSON.stringify(event))
 });
 let finished=false;
 async function shutdown(){
  if(finished)return;finished=true;
  try{await manager.stop();process.exitCode=0;}
  catch(e){console.error("M3_SHUTDOWN_FAILURE:"+e.message);process.exitCode=1;}
 }
 process.on("SIGTERM",()=>{void shutdown();});
 process.on("SIGINT",()=>{void shutdown();});
 await manager.start();
 // Parent continues alive through its child streams until shutdown, never cloud dependent.
}
main(process.argv.slice(2)).catch(e=>{
 console.error("M3_START_FAILED:"+String(e.message||e));process.exitCode=1;
});
