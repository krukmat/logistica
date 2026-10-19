"use strict";
// Strict, non-production standalone PEF Edge host configuration. No credentials on disk.
const fs=require("node:fs");
const {validateIdentity}=require("../core/event-envelope.js");
const keys=(x,allowed)=>x&&typeof x==="object"&&!Array.isArray(x)&&
  Object.keys(x).every(k=>allowed.includes(k));
const integer=(n,lo,hi)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
function validateEdgeConfig(v){
  if(!keys(v,["schemaVersion","backend","identity","storageDir","http","sampleIntervalMs",
    "workload","journal","wan","linuxLab"])||v.schemaVersion!==1||
    !["virtual-lab","linux-lab"].includes(v.backend))
    throw Error("INVALID_EDGE_CONFIG");
  const identity=validateIdentity(v.identity);
  if(typeof v.storageDir!=="string"||!v.storageDir.startsWith("/")||
     !fs.existsSync(v.storageDir)||!fs.statSync(v.storageDir).isDirectory()||
     fs.lstatSync(v.storageDir).isSymbolicLink())
    throw Error("INVALID_EDGE_STORAGE_DIR");
  const realDir=fs.realpathSync(v.storageDir);
  if(!keys(v.http,["host","port"])||v.http?.host!=="127.0.0.1"||
     !integer(v.http.port,0,65535))throw Error("EDGE_LOOPBACK_ONLY");
  if(!integer(v.sampleIntervalMs,100,30000))throw Error("INVALID_EDGE_SAMPLE_INTERVAL");
  if(!keys(v.workload,["enabled","reconcileMs","profile"])||
     typeof v.workload.enabled!=="boolean"||
     !integer(v.workload.reconcileMs,100,30000)||
     (v.workload.profile!==undefined&&!["receiver","property"].includes(v.workload.profile)))
    throw Error("INVALID_EDGE_WORKLOAD_OPTIONS");
  if(!keys(v.journal,["capacityBytes","controlReserveBytes"])||
    !integer(v.journal.capacityBytes,2048,100*1024*1024)||
    !integer(v.journal.controlReserveBytes,256,v.journal.capacityBytes-1))
    throw Error("INVALID_EDGE_JOURNAL_OPTIONS");
  if(v.backend==="virtual-lab"){
    if(v.linuxLab!==undefined)throw Error("INVALID_LINUX_LAB_SCOPE");
    if(!keys(v.wan,["primary","backup"])||
       ["primary","backup"].some(id=>!keys(v.wan[id],["link","upstream"])||
         typeof v.wan[id].link!=="boolean"||typeof v.wan[id].upstream!=="boolean"))
      throw Error("INVALID_LAB_WAN");
  }else{
    if(v.wan!==undefined||!keys(v.linuxLab,["ns","repoRoot"])||
       !v.linuxLab.ns||typeof v.linuxLab.repoRoot!=="string")
      throw Error("INVALID_LINUX_LAB_SCOPE");
  }
  return {schemaVersion:1,backend:v.backend,identity,storageDir:realDir,
    http:{host:"127.0.0.1",port:v.http.port},
    sampleIntervalMs:v.sampleIntervalMs,
    workload:{enabled:v.workload.enabled,reconcileMs:v.workload.reconcileMs,
      ...(v.workload.profile?{profile:v.workload.profile}:{})},
    journal:{...v.journal},
    ...(v.backend==="virtual-lab"?{wan:{
      primary:{...v.wan.primary},backup:{...v.wan.backup}
    }}:{linuxLab:{...v.linuxLab}})};
}
module.exports={validateEdgeConfig};
