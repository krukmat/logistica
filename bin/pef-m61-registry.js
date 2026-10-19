#!/usr/bin/env node
"use strict";
const {runM61RegistrySmoke}=require("../src/runtime/m61-registry-smoke.js");
runM61RegistrySmoke().then(x=>{
 console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;
}).catch(e=>{console.error(JSON.stringify({kind:"PEF_M61_CLOUD_LITE_REGISTRY_V1",
 ok:false,status:"LAB_FAIL",error:String(e.message||e)}));process.exitCode=1;});
