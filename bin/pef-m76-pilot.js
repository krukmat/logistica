#!/usr/bin/env node
"use strict";
const {runM76PilotGate}=require("../src/runtime/m76-pilot-gate.js");
runM76PilotGate().then(x=>{console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;})
.catch(e=>{console.error("M76_PILOT_GATE_FAILED:"+String(e.stack||e));process.exitCode=1;});
