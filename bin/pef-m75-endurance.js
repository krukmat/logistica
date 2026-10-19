#!/usr/bin/env node
"use strict";
const {runM75ShortSoak,runM75LongSoak}=require("../src/runtime/m75-endurance.js");
async function main(){
 const args=process.argv.slice(2);
 const result=args.length===0?await runM75ShortSoak():args.length===2&&args[0]==="--hours"?
  await runM75LongSoak({hours:Number(args[1]),approval:process.env.PEF_M75_LONGRUN_ACK}):
  (()=>{throw Error("M75_USAGE: npm run m7:stress -- [--hours 2|4|8|24]");})();
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}
main().catch(e=>{console.error("M75_STRESS_BLOCKED:"+String(e.stack||e));process.exitCode=1;});
