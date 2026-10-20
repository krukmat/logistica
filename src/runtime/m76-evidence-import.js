"use strict";
// Accepts structural/temporal observations only; no cryptographic provenance.
const {createHash}=require("node:crypto");
function inspectM75OperatorEvidence(value){
 const base={kind:"PEF_M75_OPERATOR_EVIDENCE_INSPECTION_V1",
  evidenceScope:"TWO_HOUR_PERIODIC_FUNCTIONAL_LAB_ONLY",
  provenance:"OPERATOR_PROVIDED_UNATTESTED_JSON",authenticityVerified:false,
  continuousLoadValidated:false,workerMemoryValidated:false,hardwareValidated:false,
  fieldPilotEvidence:false};
 const denied=reason=>({...base,accepted:false,reason});
 if(value===null||value===undefined)return denied("NOT_PROVIDED");
 if(!value||typeof value!=="object"||Array.isArray(value))return denied("NOT_AN_OBJECT");
 let raw;try{raw=JSON.stringify(value);}catch{return denied("INVALID_JSON_DATA");}
 if(!raw||Buffer.byteLength(raw)>48000)return denied("EVIDENCE_TOO_LARGE");
 const v=value,duration=7200000;
 if(v.kind!=="PEF_M75_OPERATOR_LONG_SOAK_V1"||v.status!=="LAB_PASS"||
    v.ok!==true||v.requestedHours!==2||
    v.workload!=="REAL_HTTP_CLOUD_LITE_FAILURE_MATRIX"||
    v.failures!==0||v.hardwareValidated!==false)
  return denied("WRONG_KIND_SCOPE_OR_STATUS");
 if(!Number.isSafeInteger(v.elapsedMs)||v.elapsedMs<duration||
    v.elapsedMs>duration+300000)return denied("INVALID_ELAPSED_TIME");
 if(!Array.isArray(v.samples)||!Number.isSafeInteger(v.sampleCount)||
    v.sampleCount!==v.samples.length||v.sampleCount<110||v.sampleCount>130)
  return denied("INVALID_SAMPLE_COUNT");
 let first=null,previous=null,last=null;
 for(const s of v.samples){
  if(!s||typeof s!=="object"||s.ok!==true||
     !Number.isSafeInteger(s.at)||!Number.isSafeInteger(s.peakRssBytes)||
     s.peakRssBytes<1||!Number.isSafeInteger(s.elapsedMs)||
     s.elapsedMs<1||s.error!==null)return denied("INVALID_PROBE");
  if(previous!==null&&(s.at<=previous||s.at-previous>120000||
    s.at-previous<10000))return denied("NON_PERIODIC_OR_NON_MONOTONIC_SAMPLES");
  if(first===null)first=s.at;
  previous=s.at;last=s;
 }
 const coverage=last.at-first;
 if(coverage<duration-300000||coverage>v.elapsedMs)
  return denied("INSUFFICIENT_SAMPLE_COVERAGE");
 return {...base,accepted:true,reason:"PERIODIC_FUNCTIONAL_EVIDENCE_SHAPE_ACCEPTED",
  sha256:createHash("sha256").update(raw).digest("hex"),
  sampleCount:v.sampleCount,reportedElapsedMs:v.elapsedMs,
  sampleSpanMs:coverage,firstRssBytes:v.samples[0].peakRssBytes,
  lastRssBytes:last.peakRssBytes,memoryStabilityValidated:false};
}
module.exports={inspectM75OperatorEvidence};
