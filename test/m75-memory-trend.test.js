"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {analyzeM75MemoryTrend}=require("../src/core/m75-memory-trend.js");
const MIB=1024*1024;
function synthetic({seconds=90,stepSeconds=1,parentGrowth=0,
 propertyGrowth=0,hostGrowth=0,heapGrowth=0}={}){
 const series=[];
 for(let t=0;t<=seconds;t+=stepSeconds){
  const time=t*1000;
  const point=(pid,baseMiB,growthPerMin)=>({
   pid,rssBytes:Math.round((baseMiB+growthPerMin*t/60)*MIB),
   heapUsedBytes:Math.round((5+heapGrowth*t/60)*MIB)});
  const parent=point(111,75,parentGrowth);
  series.push({elapsedMs:time,...parent,
   workers:{property:point(222,40,propertyGrowth),
    host:point(333,41,hostGrowth)}});
 }
 return {kind:"PEF_M75_SUSTAINED_MTLS_LAB_V1",
  requestedSeconds:seconds,resourceSamples:series};
}
test("M7.5.D3 six-second real-shaped report never produces a stability verdict",()=>{
 const report=synthetic({seconds:6,parentGrowth:20});
 const analyzed=analyzeM75MemoryTrend(report);
 assert.equal(analyzed.status,"INSUFFICIENT_OBSERVATION_WINDOW");
 assert.equal(analyzed.trendEligible,false);
 assert.equal(analyzed.processes.length,3);
 assert.equal(analyzed.processes[0].rssDeltaBytes,2*MIB);
 assert.equal(analyzed.processes[0].tailRssSlopeMiBPerMin,null);
 assert.equal(analyzed.memoryLeakConfirmed,false);
 assert.equal(analyzed.plateauValidated,false);
});
test("M7.5.D3 long synthetic series detects parent trend and steady worker RSS",()=>{
 const analyzed=analyzeM75MemoryTrend(synthetic({
  seconds:90,parentGrowth:4,propertyGrowth:0.15,hostGrowth:0.05,heapGrowth:1}));
 assert.equal(analyzed.status,"DESCRIPTIVE_TREND_ONLY");
 assert.equal(analyzed.trendEligible,true);
 assert.equal(analyzed.processes[0].classification,"RSS_UPWARD_TREND_OBSERVED");
 assert.equal(analyzed.processes[0].tailRssSlopeMiBPerMin,4);
 assert.equal(analyzed.processes[1].classification,"NO_CLEAR_RSS_TREND");
 assert.equal(analyzed.processes[2].classification,"NO_CLEAR_RSS_TREND");
 assert.equal(analyzed.gcControlled,false);
 assert.equal(analyzed.edgeCloudSeparatelyMeasured,false);
 assert.equal(analyzed.plateauValidated,false);
});
test("M7.5.D3 classifies decline and bounded oscillation without claiming a leak",()=>{
 const falling=analyzeM75MemoryTrend(synthetic({parentGrowth:-3}));
 assert.equal(falling.processes[0].classification,"RSS_DOWNWARD_TREND_OBSERVED");
 const oscillating=synthetic();
 for(const [i,point] of oscillating.resourceSamples.entries()){
  point.rssBytes+=i%2?150000:-150000;
  point.workers.property.rssBytes+=i%2?50000:-50000;
 }
 const result=analyzeM75MemoryTrend(oscillating);
 assert.equal(result.status,"DESCRIPTIVE_TREND_ONLY");
 assert.equal(result.processes[0].classification,"NO_CLEAR_RSS_TREND");
 assert.equal(result.memoryLeakConfirmed,false);
});
test("M7.5.D3 rejects missing series, PID changes, collisions, invalid bytes and out-of-order samples",()=>{
 const invalid=report=>{
  const result=analyzeM75MemoryTrend(report);
  assert.equal(result.status,"INVALID_EVIDENCE",JSON.stringify(result));
  assert.equal(result.trendEligible,false);
 };
 invalid(null);
 const sample=synthetic();
 sample.resourceSamples[24].workers.host.pid=444;
 invalid(sample);
 const same=synthetic();
 same.resourceSamples[0].workers.host.pid=222;
 invalid(same);
 const badTime=synthetic();
 badTime.resourceSamples[10].elapsedMs=badTime.resourceSamples[9].elapsedMs;
 invalid(badTime);
 const missing=synthetic();
 delete missing.resourceSamples[23].workers.property;
 invalid(missing);
 const notRss=synthetic();
 notRss.resourceSamples[2].workers.property.rssBytes=-1;
 invalid(notRss);
});
test("M7.5.D3 requires a sufficient requested and observed window",()=>{
 const short=synthetic({seconds:42});
 assert.equal(analyzeM75MemoryTrend(short).trendEligible,false);
 const misreported=synthetic({seconds:90});
 misreported.requestedSeconds=6;
 assert.equal(analyzeM75MemoryTrend(misreported).trendEligible,false);
});

test("M7.5.D3 offline CLI consumes bounded JSON and never reports leak/stability PASS",()=>{
 const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
 const {spawnSync}=require("node:child_process");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"m75-memory-test-"));
 try{
  const input=path.join(dir,"valid.json");
  fs.writeFileSync(input,JSON.stringify(synthetic({seconds:90,parentGrowth:2})));
  const result=spawnSync(process.execPath,[
   path.resolve(__dirname,"../bin/pef-m75-memory.js"),"--report",input
  ],{encoding:"utf8",timeout:4000});
  assert.equal(result.status,0,result.stderr);
  const parsed=JSON.parse(result.stdout);
  assert.equal(parsed.status,"DESCRIPTIVE_TREND_ONLY");
  assert.equal(parsed.memoryLeakConfirmed,false);
  assert.equal(parsed.plateauValidated,false);
  fs.writeFileSync(input,"{}");
  const rejected=spawnSync(process.execPath,[
   path.resolve(__dirname,"../bin/pef-m75-memory.js"),"--report",input
  ],{encoding:"utf8",timeout:4000});
  assert.equal(rejected.status,1);
  assert.equal(JSON.parse(rejected.stdout).status,"INVALID_EVIDENCE");
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
