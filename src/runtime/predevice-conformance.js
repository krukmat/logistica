"use strict";
// W1.10.A exercises the shared Product Core and temporary fsync journal with synthetic ports.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createScriptedWanPorts}=require("../adapters/scripted-wan-ports.js");
const {openEdgeService}=require("./edge-service.js");
const {createLocalReceipts}=require("../core/local-receipts.js");
const {openRuntimeBackend}=require("./backend-registry.js");
const {runVerifiedRouteConformance}=require("./verified-route-conformance.js");
const IDENTITY={siteId:"predevice-site",deviceId:"predevice-edge",configRevision:"lab-r1"};
async function runPredeviceConformance({tmpParent=os.tmpdir()}={}){
 const checks=[];
 const record=(id,pass,observed)=>checks.push({id,pass:Boolean(pass),observed});
 const dir=fs.mkdtempSync(path.join(tmpParent,"pef-predevice-"));
 const ports=createScriptedWanPorts();
 let edge=null;
 const open=sessionId=>openEdgeService({dir,identity:IDENTITY,sessionId,ports,
   simulatorOptions:{failbackHoldSeconds:3},
   journalOptions:{capacityBytes:65536,controlReserveBytes:4096}});
 try{
   edge=open("predevice-epoch-1");
   let step=await edge.sample(1);
   record("PORT_PROBE_PRIMARY",step.observed.selectedWan==="primary"&&
     ports.snapshot().route==="primary"&&step.event?.fsyncCompleted===true,
     {wan:step.observed.selectedWan,fsync:step.event?.fsyncCompleted===true});
   ports.setWan("primary",{upstream:false});step=await edge.sample(1);
   record("PORT_FAILOVER_TO_BACKUP",step.observed.selectedWan==="backup"&&
     ports.snapshot().route==="backup",{wan:step.observed.selectedWan});
   ports.setWan("backup",{upstream:false});step=await edge.sample(1);
   record("PORT_BOTH_DOWN_LOCAL_ONLY",step.observed.connectivity==="LOCAL_ONLY"&&
     step.observed.selectedWan===null&&ports.snapshot().route===null,
     {connectivity:step.observed.connectivity,route:ports.snapshot().route});
   const beforeProbe=edge.status().network,routeOps=ports.snapshot().routeHistory.length;
   ports.failNextProbe("primary");
   let probeRejected=false;
   try{await edge.sample(1);}catch(e){probeRejected=String(e.message).includes("INVALID_WAN_PROBE");}
   record("PORT_MALFORMED_PROBE_FAIL_CLOSED",probeRejected&&
     edge.status().network.clock===beforeProbe.clock&&
     ports.snapshot().routeHistory.length===routeOps,
     {rejected:probeRejected,clockUnchanged:edge.status().network.clock===beforeProbe.clock});
   ports.setWan("primary",{upstream:true});
   const beforeRoute=edge.status().network,routeBefore=ports.snapshot().route;
   ports.failNextRoute();let routeRejected=false;
   try{await edge.sample(1);}catch(e){routeRejected=e.message==="INJECTED_ROUTE_FAILURE";}
   record("PORT_ROUTE_FAILURE_FAIL_CLOSED",routeRejected&&
     edge.status().network.clock===beforeRoute.clock&&
     edge.status().network.selectedWan===beforeRoute.selectedWan&&
     ports.snapshot().route===routeBefore,
     {rejected:routeRejected,clockUnchanged:edge.status().network.clock===beforeRoute.clock});
   step=await edge.sample(1);
   record("PORT_ROUTE_RECOVERY",step.observed.selectedWan==="primary"&&
     ports.snapshot().route==="primary",{wan:step.observed.selectedWan});
   ports.setWan("primary",{upstream:false});ports.setWan("backup",{upstream:true});
   step=await edge.sample(1);
   record("PORT_RECOVERY_BACKUP",step.observed.selectedWan==="backup",{wan:step.observed.selectedWan});
   ports.setWan("primary",{upstream:true});
   const held=await edge.sample(1),heldAgain=await edge.sample(2),failback=await edge.sample(1);
   record("PORT_FAILBACK_HYSTERESIS",held.observed.selectedWan==="backup"&&
     heldAgain.observed.selectedWan==="backup"&&failback.observed.selectedWan==="primary",
     {early:held.observed.selectedWan,late:failback.observed.selectedWan});
   ports.setWan("primary",{upstream:false});ports.setWan("backup",{upstream:false});
   step=await edge.sample(1);
   const receipt=edge.receivePackage({receiptId:"PRE-001",packageId:"BOX-001"});
   record("PORT_OFFLINE_RECEIPT_FSYNC",step.observed.connectivity==="LOCAL_ONLY"&&
     receipt.accepted===true&&receipt.fsyncCompleted===true,
     {offline:step.observed.connectivity,accepted:receipt.accepted,fsync:receipt.fsyncCompleted});
   const dupe=edge.receivePackage({receiptId:"PRE-001",packageId:"BOX-001"});
   const conflict=edge.receivePackage({receiptId:"PRE-001",packageId:"BOX-CHANGED"});
   record("PORT_IDEMPOTENCY_AND_CONFLICT",dupe.accepted===true&&dupe.duplicate===true&&
     conflict.accepted===false&&conflict.error==="EVENT_ID_CONFLICT",
     {duplicate:dupe.duplicate,conflict:conflict.error});
   edge.close();edge=null;edge=open("predevice-epoch-2");
   const retained=edge.listReceipts();
   record("PORT_JOURNAL_REOPEN",retained.length===1&&retained[0].receiptId==="PRE-001"&&
     edge.receivePackage({receiptId:"PRE-001",packageId:"BOX-001"}).duplicate===true,
     {retained:retained.length,receiptId:retained[0]?.receiptId});
   const falseAck=createLocalReceipts({identity:IDENTITY,
     journal:{append:()=>({ack:true,fsyncCompleted:false}),retained:()=>[]}})
     .receive({receiptId:"PRE-002",packageId:"BOX-002"});
   record("PORT_FALSE_FSYNC_ACK_REJECTED",falseAck.accepted===false&&
     falseAck.error==="JOURNAL_DURABILITY_UNCONFIRMED",
     {accepted:falseAck.accepted,error:falseAck.error});
   const device=openRuntimeBackend("device");
   record("PORT_DEVICE_BACKEND_BLOCKED",device.ok===false&&
     device.error==="BACKEND_NOT_IMPLEMENTED"&&device.capabilities.physical===true,
     {backend:device.kind,error:device.error});
   for(const check of await runVerifiedRouteConformance())
     record(check.id,check.pass,check.observed);
 }catch(e){
   record("PORT_CONFORMANCE_UNHANDLED",false,String(e.message||e));
 }finally{
   try{if(edge)edge.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 const passed=checks.filter(x=>x.pass).length;
 return {kind:"PEF_PREDEVICE_PORT_CONFORMANCE_V1",status:passed===checks.length?"LAB_PASS":"LAB_FAIL",
   ok:passed===checks.length,passed,total:checks.length,checks,
   contract:"docs/contracts/predevice-ports-v1.json",
   backend:"virtual-lab",deviceBackend:"BACKEND_NOT_IMPLEMENTED",
   source:"SHARED_CORE_AND_OS_FILE_JOURNAL",
   physicalValidated:false,powerCutValidated:false,hostRoutesChanged:false,
   scope:"SYNTHETIC_WAN_PORTS_AND_TEMP_OS_FSYNC_ONLY"};
}
module.exports={runPredeviceConformance};
