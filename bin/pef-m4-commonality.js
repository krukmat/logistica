#!/usr/bin/env node
"use strict";
const {runM4Commonality}=require("../src/runtime/m4-commonality.js");
runM4Commonality().then(result=>{
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}).catch(e=>{console.error(JSON.stringify({kind:"PEF_M4_COMMONALITY_RESILIENCE_V1",status:"LAB_FAIL",
  ok:false,error:String(e.message||e)},null,2));process.exitCode=1;});
