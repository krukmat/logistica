#!/usr/bin/env node
"use strict";
const {runM72SignedReleaseSmoke}=require("../src/runtime/m72-signed-release-smoke.js");
runM72SignedReleaseSmoke().then(x=>{console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;})
.catch(e=>{console.error("M72_SIGNED_RELEASE_LAB_FAIL:"+String(e.stack||e));process.exitCode=1;});
