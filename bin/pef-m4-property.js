#!/usr/bin/env node
"use strict";
const {runPropertySmoke}=require("../src/emulator/lab/property-smoke.js");
runPropertySmoke().then(result=>{
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}).catch(e=>{console.error(JSON.stringify({kind:"PEF_M4_PROPERTY_SMOKE_V1",
  ok:false,status:"LAB_FAIL",error:String(e.message||e)},null,2));process.exitCode=1;});
