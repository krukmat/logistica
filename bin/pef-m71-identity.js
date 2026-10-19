#!/usr/bin/env node
"use strict";
const {runM71IdentitySmoke}=require("../src/runtime/m71-identity-smoke.js");
runM71IdentitySmoke().then(x=>{console.log(JSON.stringify(x,null,2));if(!x.ok)process.exitCode=1;})
 .catch(e=>{console.error("M71_IDENTITY_LAB_FAIL:"+String(e.message||e));process.exitCode=1;});
