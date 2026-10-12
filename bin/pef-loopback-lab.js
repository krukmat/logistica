#!/usr/bin/env node
"use strict";
const {runLoopbackSuite}=require("../src/emulator/lab/loopback.js");
runLoopbackSuite().then(result=>{
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.status==="LAB_PASS"?0:1;
}).catch(err=>{console.error(String(err.message||err));process.exitCode=2;});
