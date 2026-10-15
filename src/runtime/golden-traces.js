"use strict";
// W1.10.B4: pinned behavioral reference on the real shared Core and host fsync.
// Never promote a new baseline from the observed output automatically.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createHash}=require("node:crypto"),{performance}=require("node:perf_hooks");
const {openEdgeService}=require("./edge-service.js");
const {createScriptedWanPorts}=require("../adapters/scripted-wan-ports.js");
const {createVerifiedRoutePorts}=require("../adapters/verified-route-ports.js");
const {createConnectivityController}=require("../core/connectivity-controller.js");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {createFaultableFileOps}=require("../adapters/faultable-file-ops.js");
const {createLocalReceipts}=require("../core/local-receipts.js");
const {createLabCloudReplica}=require("../emulator/lab/cloud-replay.js");
const fixture=require("../../docs/contracts/golden-traces-v1.json");
const identity={siteId:"gold-site",deviceId:"gold-edge",configRevision:"gold-r1"};
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function differences(a,b,max=20){
 const out=[];
 function walk(x,y,p){
   if(out.length>=max||Object.is(x,y))return;
   if(Array.isArray(x)&&Array.isArray(y)){
     if(x.length!==y.length)out.push({path:p+".length",expected:x.length,actual:y.length});
     for(let i=0;i<Math.max(x.length,y.length)&&out.length<max;i++)walk(x[i],y[i],p+"["+i+"]");
   }else if(x&&y&&typeof x==="object"&&typeof y==="object"&&!Array.isArray(x)&&!Array.isArray(y)){
     for(const k of [...new Set([...Object.keys(x),...Object.keys(y)])].sort())walk(x[k],y[k],p+"."+k);
   }else out.push({path:p,expected:x===undefined?"MISSING":x,actual:y===undefined?"MISSING":y});
 }
 walk(a,b,"scenarios");return out;
}
function compareTraces(observed){
 const diff=differences(fixture.scenarios,observed);
 return {ok:diff.length===0,expectedSha256:hash(fixture.scenarios),
   observedSha256:hash(observed),differences:diff};
}
const caught=async fn=>{try{await fn();return null;}catch(e){return String(e.message||e);}};
async function runGoldenTraces({tmpParent=os.tmpdir()}={}){
 const root=fs.mkdtempSync(path.join(tmpParent,"pef-golden-"));
 const scenarios=[],observations=[];
 const run=async(id,fn)=>{
   const begin=performance.now(),rss=process.memoryUsage().rss;
   const trace=await fn();
   scenarios.push({id,trace});
   observations.push({scenario:id,wallMs:Math.round((performance.now()-begin)*1000)/1000,
     nodeProcessRssBytes:process.memoryUsage().rss,rssDeltaBytes:process.memoryUsage().rss-rss,
     normative:false});
 };
 const mkdir=id=>{const dir=path.join(root,id);fs.mkdirSync(dir);return dir;};
 try{
   await run("wan-failover-recovery",async()=>{
     const ports=createScriptedWanPorts(),steps=[];
     const edge=openEdgeService({dir:mkdir("wan"),identity,sessionId:"gold-wan",ports});
     async function sample(step){
       const r=await edge.sample(1),s=edge.status();
       steps.push({step,clock:s.network.clock,selectedWan:s.network.selectedWan,
         connectivity:s.network.connectivity,route:ports.snapshot().route,
         pending:s.storage.pending,fsync:r.event?.fsyncCompleted===true});
     }
     try{
       await sample("primary");
       ports.setWan("primary",{upstream:false});await sample("backup");
       ports.setWan("backup",{upstream:false});await sample("offline");
       ports.setWan("primary",{upstream:true});await sample("restore-primary");
       ports.setWan("backup",{upstream:true});await sample("restore-backup");
     }finally{edge.close();}
     return steps;
   });
   await run("offline-receipt-replay",async()=>{
     const ports=createScriptedWanPorts({primary:{link:true,upstream:false},backup:{link:true,upstream:false}});
     const dir=mkdir("receipt"),steps=[];
     let edge=openEdgeService({dir,identity,sessionId:"gold-receipt-a",ports});
     try{
       await edge.sample(1);const n=edge.status();
       steps.push({step:"offline",clock:n.network.clock,selectedWan:n.network.selectedWan,
         connectivity:n.network.connectivity,pending:n.storage.pending});
       const a=edge.receivePackage({receiptId:"GOLD-1",packageId:"BOX-1"});
       steps.push({step:"receive",accepted:a.accepted,duplicate:a.duplicate,
         fsync:a.fsyncCompleted,pending:edge.status().storage.pending});
       const b=edge.receivePackage({receiptId:"GOLD-1",packageId:"BOX-1"});
       steps.push({step:"duplicate",accepted:b.accepted,duplicate:b.duplicate,pending:edge.status().storage.pending});
       const c=edge.receivePackage({receiptId:"GOLD-1",packageId:"BOX-CHANGED"});
       steps.push({step:"conflict",accepted:c.accepted,error:c.error,pending:edge.status().storage.pending});
       edge.close();edge=openEdgeService({dir,identity,sessionId:"gold-receipt-b",ports});
       steps.push({step:"reopen",retained:edge.listReceipts().length,
         pending:edge.status().storage.pending,unsafe:edge.status().storage.unsafe});
       const cloud=createLabCloudReplica({siteId:identity.siteId,deviceId:identity.deviceId,
         allowedRevisions:[identity.configRevision]});
       const synced=await edge.sync(cloud);
       steps.push({step:"sync",status:synced.status,acked:synced.acked,
         pending:edge.status().storage.pending,remote:cloud.status().stored});
     }finally{edge.close();}
     return steps;
   });
   await run("verified-route-recovery",async()=>{
     const raw=createScriptedWanPorts(),ports=createVerifiedRoutePorts(raw),steps=[];
     const core=createConnectivityController({probe:ports.probe,applyRoute:ports.applyRoute});
     const note=(step,details={})=>steps.push({step,clock:core.status().clock,
       selectedWan:core.status().selectedWan,route:raw.snapshot().route,
       quarantined:ports.status().quarantined,...details});
     await core.sample(1);note("baseline");
     raw.setWan("primary",{upstream:false});
     raw.failNextRouteAfterMutation({rollbackFails:true});
     const partial=await caught(()=>core.sample(1));note("partial",{error:partial});
     const blocked=await caught(()=>core.sample(1));note("blocked",{error:blocked});
     raw.simulateOperatorRouteRepair("primary");
     const ok=await ports.reconcile("primary");note("reconciled",{ok});
     await core.sample(1);note("recovered");
     return steps;
   });
   await run("fsync-ambiguity",async()=>{
     const dir=mkdir("fsync"),faults=createFaultableFileOps(),steps=[];
     let journal=createFileJournal({dir,fsOps:faults.fsOps});
     const receive=(receiptId,packageId)=>createLocalReceipts({journal,identity}).receive({receiptId,packageId});
     try{
       faults.failNextFsync();
       const bad=receive("GOLD-2","BOX-2");
       steps.push({step:"fsync-error",accepted:bad.accepted,error:bad.error,unsafe:journal.status().unsafe});
       journal.close();journal=createFileJournal({dir});
       steps.push({step:"reopen",retained:journal.retained().length,
         pending:journal.status().pending,unsafe:journal.status().unsafe});
       const retry=receive("GOLD-2","BOX-2");
       steps.push({step:"duplicate",accepted:retry.accepted,duplicate:retry.duplicate,pending:journal.status().pending});
       const conflict=receive("GOLD-2","BOX-DIFFERENT");
       steps.push({step:"conflict",accepted:conflict.accepted,error:conflict.error,pending:journal.status().pending});
     }finally{journal.close();}
     return steps;
   });
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 const parity=compareTraces(scenarios);
 return {schemaVersion:1,kind:"PEF_GOLDEN_TRACE_REPORT_V1",
   ok:parity.ok,status:parity.ok?"LAB_PASS":"LAB_FAIL",
   baseline:"docs/contracts/golden-traces-v1.json",baselineSha256:parity.expectedSha256,
   canonicalSha256:parity.observedSha256,comparison:{ok:parity.ok,differences:parity.differences},
   traces:{kind:fixture.kind,schemaVersion:1,scenarios},
   metrics:{platform:process.platform,arch:process.arch,node:process.version,
     observations,comparable:false,watts:null},physicalValidated:false,powerCutValidated:false};
}
function compareReports(local,external){
 for(const [label,r] of [["local",local],["external",external]])
   if(!r||r.kind!=="PEF_GOLDEN_TRACE_REPORT_V1"||r.schemaVersion!==1||
      r.traces?.kind!==fixture.kind||!Array.isArray(r.traces.scenarios))
     throw Error("INVALID_GOLDEN_REPORT:"+label);
 const a=compareTraces(local.traces.scenarios),b=compareTraces(external.traces.scenarios);
 const cross=differences(local.traces.scenarios,external.traces.scenarios);
 const diff=[...a.differences.map(d=>({...d,source:"local"})),...b.differences.map(d=>({...d,source:"external"})),
   ...cross.map(d=>({...d,source:"cross"}))].slice(0,30);
 return {kind:"PEF_CROSS_ENV_TRACE_COMPARISON_V1",ok:diff.length===0,
   status:diff.length===0?"LAB_PASS":"LAB_FAIL",differences:diff,
   localPlatform:local.metrics?.platform||"UNKNOWN",externalPlatform:external.metrics?.platform||"UNKNOWN",
   resourcesComparable:false,physicalValidated:false};
}
module.exports={runGoldenTraces,compareTraces,compareReports,differences};
