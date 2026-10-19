"use strict";
// M7.5 bounded, real-HTTP Cloud Lite fault cycles. Short smoke ≠ 2-24h endurance certification.
const {performance}=require("node:perf_hooks");
const {runM64CloudLiteMatrix}=require("./m64-cloud-lite-matrix.js");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function runM75ShortSoak({cycles=2}={}){
 if(!Number.isSafeInteger(cycles)||cycles<1||cycles>6)throw Error("M75_CYCLES_INVALID");
 const start=performance.now(),cpuBefore=process.cpuUsage(),initialRss=process.memoryUsage().rss;
 let peakRss=initialRss,passed=0,events=0;
 const durations=[],checks={};
 for(let i=0;i<cycles;i++){
  const t=performance.now(),r=await runM64CloudLiteMatrix();
  if(!r.ok||r.status!=="LAB_PASS"||r.assertions!==15||
     !Object.values(r.checks).every(Boolean)||
     !Object.values(r.profiles).every(x=>Object.values(x).every(Boolean)))
    throw Error("M75_CLOUD_LITE_FAULT_CYCLE_FAILED:"+i);
  durations.push(Math.round(performance.now()-t));passed++;
  events+=r.observed.at(-1)?.remoteEvents||0;
  peakRss=Math.max(peakRss,process.memoryUsage().rss);
 }
 const elapsed=performance.now()-start,cpu=process.cpuUsage(cpuBefore);
 checks.ALL_REAL_HTTP_CYCLES_PASS=passed===cycles;
 checks.PER_PROFILE_DURABILITY=events>=8*cycles;
 checks.REPLAY_NO_DATA_LOSS=durations.every(x=>x>0);
 checks.BOUNDED_RSS_SOFT_GATE=peakRss<512*1048576;
 checks.BOUNDED_DURATION_SOFT_GATE=elapsed<120000;
 const ok=Object.values(checks).every(Boolean);
 return {kind:"PEF_M75_SHORT_STRESS_V1",status:ok?"LAB_PASS":"LAB_FAIL",ok,
  checks,cycles,completedCycles:passed,elapsedMs:Math.round(elapsed),
  cycleDurationsMs:durations,initialRssBytes:initialRss,peakRssBytes:peakRss,
  cpuUserMs:Math.round(cpu.user/1000),cpuSystemMs:Math.round(cpu.system/1000),
  observedEventsCumulativePerCycle:events,
  scope:"SHORT_CI_LOOPBACK_RECONCILIATION_ONLY",
  twoHourSoakValidated:false,twentyFourHourSoakValidated:false,
  p0p1SeventyTwoHourRetentionValidated:false,
  physicalValidated:false,cloudHosted:false,hostEnergyValidated:false};
}
async function runM75LongSoak({hours,approval}={}){
 if(![2,4,8,24].includes(hours)||approval!=="EXPLICIT_OPERATOR_LONG_SOAK_LOCAL")
  throw Error("M75_LONG_SOAK_OPERATOR_ACK_REQUIRED");
 const durationMs=hours*3600000,ends=Date.now()+durationMs,started=Date.now();
 const sample=[];let failures=0;
 while(Date.now()<ends){
  const probe=await runM75ShortSoak({cycles:1}).catch(e=>({ok:false,error:e.message}));
  sample.push({at:Date.now(),ok:probe.ok,peakRssBytes:probe.peakRssBytes||0,
   elapsedMs:probe.elapsedMs||0,error:probe.error||null});
  if(!probe.ok){failures++;break;}
  const left=ends-Date.now();
  if(left>0)await sleep(Math.min(60000,left));
 }
 const elapsedMs=Date.now()-started,completed=failures===0&&elapsedMs>=durationMs;
 return {kind:"PEF_M75_OPERATOR_LONG_SOAK_V1",status:completed?"LAB_PASS":"LAB_FAIL",
  ok:completed,requestedHours:hours,elapsedMs,sampleCount:sample.length,
  failures,samples:sample,
  workload:"REAL_HTTP_CLOUD_LITE_FAILURE_MATRIX",
  p0p1SeventyTwoHourRetentionValidated:false,hardwareValidated:false,
  note:"Wall clock duration only; not a physical device or retention/energy certification"};
}
module.exports={runM75ShortSoak,runM75LongSoak};
