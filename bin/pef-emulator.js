#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runScenario}=require("../src/emulator/scenario.js");
function main(args){
  if(args.length!==1||args[0]==="--help"){console.log("Usage: node bin/pef-emulator.js scenarios/wan-offline.json | --all");return 0;}
  const dir=path.resolve(__dirname,"../scenarios");
  const files=args[0]==="--all"?
    fs.readdirSync(dir).filter(x=>x.endsWith(".json")).sort().map(x=>path.join(dir,x)):
    [path.resolve(process.cwd(),args[0])];
  if(!files.length){console.error("No emulator scenarios");return 2;}
  const outputs=files.map(p=>runScenario(JSON.parse(fs.readFileSync(p,"utf8"))));
  const status=outputs.every(x=>x.status==="SIM_PASS")?"SIM_PASS":"SIM_FAIL";
  console.log(JSON.stringify({kind:"PEF_EMULATOR_RUN",status,scenario_count:outputs.length,results:outputs},null,2));
  return status==="SIM_PASS"?0:1;
}
try{process.exitCode=main(process.argv.slice(2));}catch(err){console.error(err.message||String(err));process.exitCode=2;}
