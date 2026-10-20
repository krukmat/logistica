"use strict";
// M7.5.D3: portable descriptive statistics. No I/O, GC invocation or leak verdict.
// RSS samples include shared mappings; never sum them as physical RAM consumption.
const MIB=1024*1024,PROFILES=["property","host"];
const KINDS=new Set(["PEF_M75_SUSTAINED_MTLS_LAB_V1"]);
function median(values){
 const sorted=values.slice().sort((a,b)=>a-b),i=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;
}
function regressionSlope(points,key){
 const n=points.length,t0=points[0].t;
 const xs=points.map(p=>(p.t-t0)/60000),ys=points.map(p=>p[key]/MIB);
 const meanX=xs.reduce((a,b)=>a+b,0)/n,meanY=ys.reduce((a,b)=>a+b,0)/n;
 let covariance=0,variance=0;
 for(let i=0;i<n;i++){
  covariance+=(xs[i]-meanX)*(ys[i]-meanY);
  variance+=(xs[i]-meanX)**2;
 }
 return variance>0?Math.round(covariance/variance*1000)/1000:null;
}
const positive=n=>Number.isSafeInteger(n)&&n>=0;
function invalid(reason){return {kind:"PEF_M75_MEMORY_TREND_V1",
 status:"INVALID_EVIDENCE",reason,trendEligible:false,diagnosticOnly:true,
 memoryLeakConfirmed:false,plateauValidated:false,gcControlled:false,
 hardwareValidated:false};}
function analyzeM75MemoryTrend(report){
 if(!report||!KINDS.has(report.kind)||!Array.isArray(report.resourceSamples)||
    report.resourceSamples.length<2||report.resourceSamples.length>4096)
  return invalid("INVALID_KIND_OR_SERIES");
 const series=report.resourceSamples,points={parent:[],property:[],host:[]};
 let previousTime=-1,parentPid=null,workerPids={property:null,host:null};
 for(const sample of series){
  if(!sample||!Number.isSafeInteger(sample.elapsedMs)||sample.elapsedMs<=previousTime||
     !positive(sample.rssBytes)||sample.rssBytes===0||
     !positive(sample.heapUsedBytes)||!Number.isSafeInteger(sample.pid)||sample.pid<=0)
   return invalid("INVALID_PARENT_SAMPLE_OR_TIME");
  if(parentPid!==null&&sample.pid!==parentPid)return invalid("PARENT_PID_CHANGED");
  parentPid=sample.pid;previousTime=sample.elapsedMs;
  points.parent.push({t:sample.elapsedMs,rssBytes:sample.rssBytes,
   heapUsedBytes:sample.heapUsedBytes});
  for(const profile of PROFILES){
   const child=sample.workers?.[profile];
   if(!child||!positive(child.rssBytes)||child.rssBytes===0||
      !positive(child.heapUsedBytes)||!Number.isSafeInteger(child.pid)||child.pid<=0||
      child.pid===sample.pid)
    return invalid("MISSING_OR_INVALID_CHILD_"+profile.toUpperCase());
   if(workerPids[profile]!==null&&workerPids[profile]!==child.pid)
    return invalid("WORKER_PID_CHANGED_"+profile.toUpperCase());
   workerPids[profile]=child.pid;
   points[profile].push({t:sample.elapsedMs,
    rssBytes:child.rssBytes,heapUsedBytes:child.heapUsedBytes});
  }
 }
 if(workerPids.property===workerPids.host)return invalid("WORKER_PID_COLLISION");
 const spanMs=series.at(-1).elapsedMs-series[0].elapsedMs;
 const longEnough=Number.isSafeInteger(report.requestedSeconds)&&
   report.requestedSeconds>=60&&spanMs>=45000&&series.length>=16;
 const warmupMs=Math.max(5000,Math.round(spanMs*0.2));
 const cutoff=series[0].elapsedMs+warmupMs;
 const summarize=(role,pid)=>{
  const all=points[role],last=all.at(-1),first=all[0];
  const tail=all.filter(p=>p.t>=cutoff);
  const tailSpanMs=tail.length>1?tail.at(-1).t-tail[0].t:0;
  const eligible=longEnough&&tail.length>=12&&tailSpanMs>=30000;
  const sliceSize=Math.max(1,Math.floor(tail.length/3));
  const rssSlope=eligible?regressionSlope(tail,"rssBytes"):null;
  const heapSlope=eligible?regressionSlope(tail,"heapUsedBytes"):null;
  const firstMedian=eligible?median(tail.slice(0,sliceSize).map(p=>p.rssBytes)):null;
  const lastMedian=eligible?median(tail.slice(-sliceSize).map(p=>p.rssBytes)):null;
  const robustRssShiftMiB=eligible?Math.round((lastMedian-firstMedian)/MIB*1000)/1000:null;
  let classification="INSUFFICIENT_OBSERVATION_WINDOW";
  // Descriptive heuristic only. Do not interpret an increasing RSS slope as a leak.
  if(eligible){
   if(rssSlope>=1&&robustRssShiftMiB>=0.75)classification="RSS_UPWARD_TREND_OBSERVED";
   else if(rssSlope<=-1&&robustRssShiftMiB<=-0.75)
    classification="RSS_DOWNWARD_TREND_OBSERVED";
   else classification="NO_CLEAR_RSS_TREND";
  }
  return {role,pid,samples:all.length,sampleSpanMs:spanMs,
   warmupExcludedMs:warmupMs,tailSamples:tail.length,tailSpanMs,
   firstRssBytes:first.rssBytes,lastRssBytes:last.rssBytes,
   maxObservedRssBytes:Math.max(...all.map(p=>p.rssBytes)),
   rssDeltaBytes:last.rssBytes-first.rssBytes,
   heapUsedDeltaBytes:last.heapUsedBytes-first.heapUsedBytes,
   tailRssSlopeMiBPerMin:rssSlope,tailHeapSlopeMiBPerMin:heapSlope,
   robustTailRssShiftMiB:robustRssShiftMiB,classification,
   trendEligible:eligible,leakConfirmed:false,plateauValidated:false};
 };
 const processes=[
  summarize("parent",parentPid),summarize("property",workerPids.property),
  summarize("host",workerPids.host)];
 const eligible=processes.every(p=>p.trendEligible);
 return {kind:"PEF_M75_MEMORY_TREND_V1",
  status:eligible?"DESCRIPTIVE_TREND_ONLY":"INSUFFICIENT_OBSERVATION_WINDOW",
  reason:eligible?"HEURISTIC_NO_LEAK_OR_STABILITY_CLAIM":
   "REQUIRES_60_SECOND_RUN_45_SECOND_SPAN_16_SAMPLES_AND_30_SECOND_TAIL",
  trendEligible:eligible,requestedSeconds:report.requestedSeconds,
  sampleCount:series.length,sampleSpanMs:spanMs,
  processes,heuristicThresholds:{upwardSlopeMiBPerMin:1,
   upwardRobustShiftMiB:0.75,warmupFraction:0.2,
   minRequestedSeconds:60,minSampleSpanMs:45000,minTailSpanMs:30000,
   minSamples:16},
  processAttribution:"SHARED_EDGE_CLOUD_PARENT_AND_DISTINCT_PROPERTY_HOST_CHILDREN",
  diagnosticOnly:true,memoryLeakConfirmed:false,plateauValidated:false,
  gcControlled:false,edgeCloudSeparatelyMeasured:false,hardwareValidated:false,
  sustainedTwoHourValidated:false};
}
module.exports={analyzeM75MemoryTrend};
