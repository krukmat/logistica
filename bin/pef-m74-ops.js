#!/usr/bin/env node
"use strict";
const {runM74OperationalSmoke}=require("../src/runtime/m74-operational-smoke.js");
runM74OperationalSmoke().then(x=>{console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;})
.catch(e=>{console.error("M74_OPERATIONS_FAILED:"+String(e.stack||e));process.exitCode=1;});
