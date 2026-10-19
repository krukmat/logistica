#!/usr/bin/env node
"use strict";
const {runM54ServiceContract}=require("../src/runtime/m5-systemd-unit.js");
try{console.log(JSON.stringify(runM54ServiceContract(),null,2));}
catch(e){console.error("M54_SYSTEMD_BLOCKED:"+String(e.message||e));process.exitCode=1;}
