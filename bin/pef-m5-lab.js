#!/usr/bin/env node
"use strict";
const {runM5InstallSmoke}=require("../src/runtime/m5-install-smoke.js");
runM5InstallSmoke({linuxRequired:process.argv.includes("--require-linux")}).then(x=>{
 console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;
}).catch(e=>{console.error(JSON.stringify({kind:"PEF_M5_INSTALL_LINUX_LAB_V1",
  ok:false,status:"LAB_FAIL",error:String(e.message||e)},null,2));process.exitCode=1;});
