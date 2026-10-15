"use strict";
// Read-only host observation: no NIC config, no privileged access, no energy guess.
// Journal benchmark only writes to a private temp folder then deletes it.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {performance}=require("node:perf_hooks");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {createLocalReceipts}=require("../core/local-receipts.js");
const identity={siteId:"c2-lab",deviceId:"c2-sample",configRevision:"c2-r1"};
function percentile(values,q){
 if(!Array.isArray(values)||!values.length)return null;
 const a=values.slice().sort((x,y)=>x-y);
 return Math.round(a[Math.min(a.length-1,Math.floor((a.length-1)*q))]*1000)/1000;
}
function observeHost({tmpParent=os.tmpdir(),samples=8}={}){
 if(!Number.isSafeInteger(samples)||samples<3||samples>32)throw Error("C2_INVALID_SAMPLE_COUNT");
 const dir=fs.mkdtempSync(path.join(tmpParent,"pef-c2-host-"));
 const timings=[];let journal=null,failures=0,observed=0;
 try{
   journal=createFileJournal({dir,capacityBytes:65536,controlReserveBytes:4096});
   const receiver=createLocalReceipts({journal,identity});
   for(let n=0;n<samples;n++){
     const start=performance.now();
     const r=receiver.receive({receiptId:"C2-R"+n,packageId:"C2-BOX"+n});
     timings.push(performance.now()-start);
     if(r.accepted&&r.fsyncCompleted)observed++;else failures++;
   }
   journal.close();journal=null;
   journal=createFileJournal({dir,capacityBytes:65536,controlReserveBytes:4096});
   const recover=journal.retained().length===samples;
   const label=process.env.CI==="true"?"EPHEMERAL_CI_RUNNER":"LOCAL_DEVELOPMENT_HOST";
   return {kind:"PEF_C2_HOST_OBSERVATION_V1",status:observed===samples&&recover?"LAB_PASS":"LAB_FAIL",
     scope:label,platform:process.platform,arch:process.arch,node:process.version,
     cpuCount:os.cpus().length,totalMemoryMiB:Math.floor(os.totalmem()/1048576),
     processRssBytes:process.memoryUsage().rss,sampleCount:samples,
     journal:{ackAndFsync:samples-failures,failed:failures,
       reopenRetained:journal.retained().length,p50WallMs:percentile(timings,.50),
       p95WallMs:percentile(timings,.95)},
     metricsScope:"SINGLE_NODE_PROCESS_HOST_OBSERVATION_NOT_DEVICE_BENCHMARK",
     networkThroughputMbps:null,boardIdleWatts:null,thermalDegreesC:null,
     actualPowerCutRecovered:null,physicalValidated:false,deviceQualified:false,
     hostRoutesChanged:false};
 }finally{
   journal?.close();fs.rmSync(dir,{recursive:true,force:true});
 }
}
module.exports={observeHost,percentile};
