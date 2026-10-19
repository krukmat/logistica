"use strict";
// M4.4 orchestrates previously validated autonomous Edge scenarios. No new Core variant.
const {randomUUID}=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {runPropertySmoke}=require("../emulator/lab/property-smoke.js");
const {runHostSmoke}=require("../emulator/lab/host-smoke.js");
const {runM4Commonality}=require("./m4-commonality.js");
const EXPECTED=Object.freeze({property:13,host:14,parity:9,runtime:15,supervisor:8,storage:5});
function getCommit(){
  try{return execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",timeout:3000}).trim();}
  catch{return "UNAVAILABLE_NO_GIT";}
}
function checksValid(checks,count){
 return checks&&typeof checks==="object"&&!Array.isArray(checks)&&
   Object.keys(checks).length===count&&Object.values(checks).every(x=>x===true);
}
function validateIntegrated(report){
 if(report?.kind!=="PEF_M4_INTEGRATED_LAB_V1"||report.schemaVersion!==1||
   report.status!=="LAB_PASS"||report.ok!==true||
   !/^[0-9a-f-]{36}$/.test(report.runId||"")||
   Number.isNaN(Date.parse(report.createdAt))||
   !["property","host"].every(p=>report[p]?.status==="LAB_PASS"&&report[p]?.ok===true)||
   !checksValid(report.property.checks,EXPECTED.property)||
   !checksValid(report.host.checks,EXPECTED.host)||
   report.property.worker!=="pef-property"||report.host.worker!=="pef-host"||
   report.property.incident?.alertEventId!=="property.property-edge.INC-001.alert"||
   report.host.incident?.alertEventId!=="host.host-edge.HOST-001.open"||
   ![report.property,report.host].every(x=>
     x.eventsAfterReplay===0&&x.incident?.status==="ACKNOWLEDGED"&&
     x.incident?.cloudAcked===true&&x.incident?.ackCloudAcked===true&&
     x.actualLimitsEnforced===false&&x.cloudMockOnly===true&&
     x.physicalValidated===false&&x.powerCutValidated===false&&
     x.realCloudProvisioned===false&&x.standaloneWithoutDashboard===true)||
   report.commonality?.kind!=="PEF_M4_COMMONALITY_RESILIENCE_V1"||
   report.commonality.ok!==true||report.commonality.status!=="LAB_PASS"||
   !checksValid(report.commonality.parity?.checks,EXPECTED.parity)||
   !["property","host"].every(p=>{
     const x=report.commonality.profiles?.[p];
     return x?.passed===true&&x.runtime?.status==="LAB_PASS"&&
       x.supervisor?.status==="LAB_PASS"&&x.storage?.status==="LAB_PASS"&&
       checksValid(x.runtime.checks,EXPECTED.runtime)&&
       checksValid(x.supervisor.checks,EXPECTED.supervisor)&&
       checksValid(x.storage.checks,EXPECTED.storage)&&
       x.runtime.eventsAfterReplay===0&&x.runtime.isolation==="NODE_PROCESS_ONLY"&&
       x.runtime.actualLimitsEnforced===false;
   })||
   report.commonality.hardwareValidated!==false||
   report.commonality.physicalPowerCutValidated!==false||
   report.commonality.propertyHostLinuxIsolationValidated!==false||
   report.commonality.remoteCloudProvisioned!==false||
   report.limits?.physicalValidated!==false||
   report.limits?.realWanValidated!==false||
   report.limits?.realCloudProvisioned!==false||
   report.limits?.propertyHostLinuxIsolationValidated!==false||
   report.limits?.powerCutValidated!==false||
   report.limits?.retention72hValidated!==false||
   report.limits?.signatureValidated!==false)
   throw Error("M4_INTEGRATED_REPORT_INVALID");
 return true;
}
function buildTrace(report){
 const events=[];
 const add=(profile,stage,checks)=>{
   for(const [name,pass] of Object.entries(checks)){
     events.push({runId:report.runId,sequence:events.length+1,kind:"ASSERTION",
       source:"SCENARIO_CHECK_NOT_RAW_JOURNAL_EVENT",profile,stage,check:name,pass});
   }
 };
 add("property","M4.1",report.property.checks);
 add("host","M4.2",report.host.checks);
 add("shared","M4.3.PARITY",report.commonality.parity.checks);
 for(const profile of ["property","host"]){
   const obj=report.commonality.profiles[profile];
   add(profile,"M4.3.RUNTIME",obj.runtime.checks);
   add(profile,"M4.3.SUPERVISOR",obj.supervisor.checks);
   add(profile,"M4.3.STORAGE",obj.storage.checks);
 }
 return events;
}
async function runM4Integrated({runId=randomUUID(),createdAt=new Date().toISOString(),commit=getCommit()}={}){
 const property=await runPropertySmoke();
 const host=await runHostSmoke();
 const commonality=await runM4Commonality();
 const ok=[property,host,commonality].every(x=>x.ok===true&&x.status==="LAB_PASS");
 const report={kind:"PEF_M4_INTEGRATED_LAB_V1",schemaVersion:1,runId,createdAt,commit,
   hostEnvironment:{platform:process.platform,arch:process.arch,node:process.version},
   status:ok?"LAB_PASS":"LAB_FAIL",ok,
   property,host,commonality,
   limits:{physicalValidated:false,realWanValidated:false,realCloudProvisioned:false,
     propertyHostLinuxIsolationValidated:false,powerCutValidated:false,
     retention72hValidated:false,signatureValidated:false,
     evidenceKind:"OPERATOR_OR_CI_SOFTWARE_LAB_NO_HARDWARE"}};
 // Partial failures must never be stamped as a passing integrated run.
 if(!ok)throw Error("M4_INTEGRATED_COMPONENT_FAILED");
 validateIntegrated(report);
 return {report,trace:buildTrace(report)};
}
module.exports={runM4Integrated,validateIntegrated,buildTrace,EXPECTED};
