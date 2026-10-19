#!/usr/bin/env node
"use strict";
const {runM64CloudLiteMatrix}=require("../src/runtime/m64-cloud-lite-matrix.js");
runM64CloudLiteMatrix().then(result=>{
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}).catch(e=>{
 console.error(JSON.stringify({kind:"PEF_M64_CLOUD_LITE_FAULT_MATRIX_V1",
  status:"LAB_FAIL",ok:false,error:String(e.stack||e)}));
 process.exitCode=1;
});
