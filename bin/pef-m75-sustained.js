#!/usr/bin/env node
"use strict";
const {runM75Sustained}=require("../src/runtime/m75-sustained.js");
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=="--seconds")throw Error("M75_USAGE: npm run m7:sustained -- --seconds 6|900|1800");
 const seconds=Number(args[1]);
 if(!Number.isInteger(seconds)||seconds<4||seconds>1800)throw Error("M75_INVALID_DURATION");
 if(seconds>30&&process.env.PEF_M75_LONGRUN_ACK!=="EXPLICIT_OPERATOR_LONG_SOAK_LOCAL")
  throw Error("M75_LONG_RUN_EXPLICIT_ACK_REQUIRED");
 const result=await runM75Sustained({durationSeconds:seconds});
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}
main().catch(e=>{console.error("M75_SUSTAINED_BLOCKED:"+String(e.stack||e));process.exitCode=1;});
