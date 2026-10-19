#!/usr/bin/env node
"use strict";
// M6.1 standalone Cloud Lite registry. Local loopback HTTP lab only; no external networking.
const path=require("node:path");
const {createCloudLiteRegistryServer}=require("../src/runtime/cloud-lite-registry-server.js");
async function main(args){
 if(![2,3].includes(args.length)||args[0]!=="--root"||!path.isAbsolute(args[1])||
    (args.length===3&&args[2]!=="--enable-ingest"))
   throw Error("M61_USAGE:node bin/pef-cloud-lite.js --root /absolute/existing/private/temp/dir");
 const service=createCloudLiteRegistryServer({dir:args[1],
   adminToken:process.env.PEF_CLOUD_LITE_ADMIN_TOKEN,port:0,
   enableIngest:args[2]==="--enable-ingest"});
 const url=await service.listen();
 console.log(JSON.stringify({kind:"PEF_CLOUD_LITE_LOCAL_READY_V1",url,
   scope:"LOOPBACK_LAB_ONLY",ingestionAvailable:args[2]==="--enable-ingest",
   remoteTlsValidated:false,physicalValidated:false}));
 let stopping=false;
 function shutdown(){
   if(stopping)return;stopping=true;
   void service.close().then(()=>{process.exitCode=0;},e=>{
     console.error("CLOUD_LITE_STOP_FAILED:"+String(e.message||e));process.exitCode=1;
   });
 }
 process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
}
main(process.argv.slice(2)).catch(e=>{
 console.error("CLOUD_LITE_START_BLOCKED:"+String(e.message||e));process.exitCode=1;
});
