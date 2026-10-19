#!/usr/bin/env node
"use strict";
const {runM63EdgeSyncSmoke}=require("../src/runtime/m63-edge-cloud-lite-smoke.js");
runM63EdgeSyncSmoke().then(x=>{console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;})
 .catch(e=>{console.error(JSON.stringify({kind:"PEF_M63_EDGE_CLOUD_LITE_LOCAL_SYNC_V1",
 ok:false,status:"LAB_FAIL",error:String(e.message||e)}));process.exitCode=1;});
