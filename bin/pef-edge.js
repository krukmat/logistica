#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {validateEdgeConfig}=require("../src/runtime/edge-config.js");
const {createAutonomousEdgeHost}=require("../src/runtime/autonomous-edge.js");
async function main(args){
  if(args.includes("--help")){console.log("Usage: PEF_EDGE_TOKEN=<operator secret> node bin/pef-edge.js --config /absolute/path.json [--check]");return;}
  const position=args.indexOf("--config");
  if(position<0||position+1>=args.length||args.some((x,i)=>i!==position&&i!==position+1&&x!=="--check"))
    throw Error("EDGE_CONFIG_PATH_REQUIRED");
  const configFile=path.resolve(args[position+1]);
  const stat=fs.lstatSync(configFile);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error("EDGE_CONFIG_FILE_UNSAFE");
  const cfg=validateEdgeConfig(JSON.parse(fs.readFileSync(configFile,"utf8")));
  if(args.includes("--check")){console.log(JSON.stringify({kind:"PEF_EDGE_CONFIG_CHECK",ok:true,
    backend:cfg.backend,hardwareValidated:false}));return;}
  const edge=createAutonomousEdgeHost({config:cfg,token:process.env.PEF_EDGE_TOKEN});
  const url=await edge.listen();
  console.log(JSON.stringify({kind:"PEF_EDGE_READY",url,sessionId:edge.state().identity.sessionId,
    backend:cfg.backend,scope:"LAB_ONLY",dashboardRequired:false,hardwareValidated:false}));
  let finishing=false;
  async function shutdown(){
    if(finishing)return;finishing=true;
    try{await edge.close();process.exitCode=0;}
    catch(e){console.error("PEF_EDGE_SHUTDOWN_ERROR:"+e.message);process.exitCode=1;}
  }
  process.on("SIGINT",()=>{void shutdown();});
  process.on("SIGTERM",()=>{void shutdown();});
}
main(process.argv.slice(2)).catch(e=>{console.error("PEF_EDGE_START_FAILED:"+String(e.message||e));process.exitCode=1;});
