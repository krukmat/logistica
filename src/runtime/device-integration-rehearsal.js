"use strict";
// W1.10.C1: existing bounded route adapter + shared Connectivity Core + host-fsync journal.
// All network observations and route writes are scripted and in-memory.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {createScriptedWanPorts}=require("../adapters/scripted-wan-ports.js");
const {createBoundedWanPorts}=require("../adapters/bounded-wan-ports.js");
const {createConnectivityController}=require("../core/connectivity-controller.js");
const {createLocalReceipts}=require("../core/local-receipts.js");
const {writeLabBootIntent,readLabBootIntent}=require("./device-boot-intent.js");
const {inspectDeviceDriverShape,assessDeviceReadiness}=require("./device-preflight.js");
const {openRuntimeBackend}=require("./backend-registry.js");
const contract=require("../../docs/contracts/device-integration-v1.json");
const IDENTITY={siteId:"c1-site",deviceId:"c1-device",configRevision:"c1-r1"};
const checkError=fn=>{try{fn();return null;}catch(e){return String(e.message||e);}};
const reject=async fn=>{try{await fn();return null;}catch(e){return String(e.message||e);}};
async function runDeviceIntegrationRehearsal({tmpParent=os.tmpdir()}={}){
 const checks=[],record=(id,pass,observed)=>checks.push({id,pass:Boolean(pass),observed});
 const dir=fs.mkdtempSync(path.join(tmpParent,"pef-c1-"));
 let journal=null;
 try{
   const requested=openRuntimeBackend("device",{ports:createScriptedWanPorts(),dir,identity:IDENTITY,sessionId:"c1-epoch"});
   record("C1_BACKEND_DEVICE_DISABLED",!requested.ok&&requested.error==="BACKEND_NOT_IMPLEMENTED",
     {error:requested.error,hostRoutesChanged:false});
   const full={};
   for(const [group,p] of Object.entries(contract.driverPorts))
     full[group]=Object.fromEntries(p.required.map(key=>[key,()=>{}]));
   const valid=inspectDeviceDriverShape(full);
   const missing=inspectDeviceDriverShape({...full,wan:{probe:()=>{},applyRoute:()=>{}}});
   record("C1_DRIVER_INTERFACE_DECLARED",valid.ok&&!missing.ok&&
     missing.missing.includes("wan.readRoute")&&valid.deviceAuthorized===false,
     {declaredMethods:Object.values(contract.driverPorts).reduce((a,x)=>a+x.required.length,0),
       missing:missing.missing,authorized:valid.deviceAuthorized});
   const injected=Object.fromEntries(contract.requirements.map(x=>[x.id,"DEVICE_PASS"]));
   const pending=assessDeviceReadiness({claims:injected});
   record("C1_UNATTESTED_REQUIREMENTS_BLOCKED",pending.status==="DEVICE_BLOCKED"&&
     pending.requirements.length===contract.requirements.length&&
     pending.requirements.every(x=>x.claimed==="DEVICE_PASS"&&!x.verified)&&
     pending.productionAuthorized===false,
     {requirements:pending.requirements.length,claimedPasses:injected?Object.keys(injected).length:0,
       backendError:pending.backendError});
   journal=createFileJournal({dir});
   const absent=checkError(()=>readLabBootIntent({journal,identity:IDENTITY}));
   record("C1_MISSING_BOOT_INTENT_DENIED",absent==="C1_BOOT_INTENT_MISSING_OR_AMBIGUOUS",
     {error:absent});
   const falseJournal={append:()=>({ack:true,fsyncCompleted:false}),retained:()=>[]};
   const noFsync=checkError(()=>writeLabBootIntent({journal:falseJournal,identity:IDENTITY}));
   record("C1_BOOT_INTENT_REQUIRES_FSYNC",noFsync==="C1_BOOT_INTENT_NOT_DURABLE",
     {error:noFsync});
   const baseline=writeLabBootIntent({journal,identity:IDENTITY,expectedRoute:null});
   journal.close();journal=null;
   journal=createFileJournal({dir});
   const wrong=checkError(()=>readLabBootIntent({journal,identity:{...IDENTITY,configRevision:"rev-changed"}}));
   record("C1_IDENTITY_REVISION_MISMATCH_DENIED",
     baseline.trustedForDevice===false&&wrong==="C1_BOOT_INTENT_SCOPE_OR_SCHEMA_MISMATCH",
     {error:wrong,trustedForDevice:baseline.trustedForDevice});
   const raw=createScriptedWanPorts();
   raw.simulateOperatorRouteRepair("backup");
   const ports=createBoundedWanPorts(raw,{probeTimeoutMs:100,routeTimeoutMs:100,reconcileTimeoutMs:100});
   const controller=createConnectivityController({probe:ports.probe,applyRoute:ports.applyRoute});
   const blocked=await reject(()=>controller.sample(1));
   const observed=readLabBootIntent({journal,identity:IDENTITY});
   const initial=await ports.reconcile(observed.expectedRoute);
   const routeWrites=raw.snapshot().routeHistory.length;
   record("C1_BOOT_ROUTE_MISMATCH_NO_MUTATION",
     blocked==="ROUTE_BOOT_RECONCILIATION_REQUIRED"&&!initial&&
     routeWrites===1&&controller.status().clock===0&&raw.snapshot().route==="backup",
     {blocked,matched:initial,route:raw.snapshot().route,history:routeWrites});
   raw.simulateOperatorRouteRepair(null);
   const reconciled=await ports.reconcile(observed.expectedRoute);
   const sample=await controller.sample(1);
   const receipt=createLocalReceipts({journal,identity:IDENTITY})
     .receive({receiptId:"C1-R1",packageId:"C1-BOX1"});
   record("C1_EXPLICIT_REPAIR_RECONCILES_CORE",reconciled&&
     sample.selectedWan==="primary"&&raw.snapshot().route==="primary"&&
     receipt.accepted&&receipt.fsyncCompleted,
     {reconciled,selectedWan:sample.selectedWan,receiptAccepted:receipt.accepted,fsync:receipt.fsyncCompleted});
   journal.close();journal=null;
   journal=createFileJournal({dir});
   const reboot=createBoundedWanPorts(raw,{probeTimeoutMs:100,routeTimeoutMs:100,reconcileTimeoutMs:100});
   const rerun=createConnectivityController({probe:reboot.probe,applyRoute:reboot.applyRoute});
   const bootExpected=readLabBootIntent({journal,identity:IDENTITY}).expectedRoute;
   const noWrite=await reject(()=>rerun.sample(1));
   const mismatched=await reboot.reconcile(bootExpected);
   const retained=journal.retained().some(x=>x.eventId==="receipt."+IDENTITY.deviceId+".C1-R1");
   record("C1_REBOOT_REQUIRES_RECONCILIATION",noWrite==="ROUTE_BOOT_RECONCILIATION_REQUIRED"&&
     !mismatched&&retained&&rerun.status().clock===0&&raw.snapshot().route==="primary",
     {blocked:noWrite,mismatched,retained,route:raw.snapshot().route});
 }catch(e){record("C1_UNEXPECTED_FAILURE",false,String(e.stack||e));}
 finally{try{journal?.close();}finally{fs.rmSync(dir,{force:true,recursive:true});}}
 const passed=checks.filter(c=>c.pass).length;
 return {kind:"PEF_DEVICE_INTEGRATION_REHEARSAL_V1",
   status:passed===checks.length&&checks.length===contract.labChecks.length?"LAB_PASS":"LAB_FAIL",
   ok:passed===checks.length&&checks.length===contract.labChecks.length,
   passed,total:checks.length,checks,contract:"docs/contracts/device-integration-v1.json",
   device:assessDeviceReadiness(),physicalValidated:false,deviceBackend:"BACKEND_NOT_IMPLEMENTED",
   onDeviceExecuted:false,hostRoutesChanged:false,provisioningPerformed:false,
   scope:"SYNTHETIC_PORTS_AND_HOST_FSYNC_ONLY"};
}
module.exports={runDeviceIntegrationRehearsal};
