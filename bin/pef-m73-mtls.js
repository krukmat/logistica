#!/usr/bin/env node
"use strict";
const {runM73MtlsSmoke}=require("../src/runtime/m73-mtls-smoke.js");
runM73MtlsSmoke().then(x=>{console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;})
.catch(e=>{console.error("M73_MTLS_LAB_FAIL:"+String(e.stack||e));process.exitCode=1;});
