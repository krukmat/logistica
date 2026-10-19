#!/usr/bin/env node
"use strict";
const {runM62IngestSmoke}=require("../src/runtime/m62-ingest-smoke.js");
runM62IngestSmoke().then(x=>{console.log(JSON.stringify(x,null,2));
 if(!x.ok)process.exitCode=1;
}).catch(e=>{console.error(JSON.stringify({kind:"PEF_M62_CLOUD_LITE_DURABLE_INGEST_V1",
 ok:false,status:"LAB_FAIL",error:String(e.message||e)}));process.exitCode=1;});
