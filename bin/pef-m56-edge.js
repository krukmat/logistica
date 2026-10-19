#!/usr/bin/env node
"use strict";
// Only for disposable GitHub-hosted Linux systemd/root isolation integration; NEVER on Mac.
const {startM56CiService}=require("../src/runtime/m56-kernel-service.js");
async function main(){
 const {edge,ready}=await startM56CiService(process.argv.slice(2));
 console.log(JSON.stringify(ready));
 let shuttingDown=false;
 const shutdown=()=>{
   if(shuttingDown)return;shuttingDown=true;
   void edge.close().then(()=>{process.exitCode=0;},e=>{
     console.error("M56_SERVICE_SHUTDOWN_FAILED:"+String(e.message||e));process.exitCode=1;});
 };
 process.on("SIGINT",shutdown);
 process.on("SIGTERM",shutdown);
}
main().catch(e=>{console.error("M56_SERVICE_BOOT_BLOCKED:"+String(e.message||e));process.exitCode=1;});
