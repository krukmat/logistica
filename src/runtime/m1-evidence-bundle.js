"use strict";
const fs=require("node:fs"),path=require("node:path");
const {createHash,randomUUID}=require("node:crypto");
const {runM1Scenario}=require("./m1-scenario.js");
const NAMES=["report.json","trace.ndjson","summary.md"];
const IDS=["M1_01_AUTONOMOUS_EDGE_RUNNING","M1_02_VIRTUAL_WAN_LOCAL_ONLY",
 "M1_03_OFFLINE_RECEIPT_FSYNC","M1_04_IDEMPOTENCY_AND_CONFLICT",
 "M1_05_SIGKILL_RECOVER_REOPEN","M1_06_RECONNECT_AND_AMBIGUOUS_ACK",
 "M1_07_RETRY_AND_DURABLE_CURSOR"];
const digest=data=>createHash("sha256").update(data).digest("hex");
const json=obj=>JSON.stringify(obj,null,2)+"\n";
function summarize(r){
 const rows=r.checks.map(c=>"| "+c.id+" | "+(c.pass?"PASS":"FAIL")+
  " | "+c.durationMs+" |").join("\n");
 return ["# PEF M1 — "+r.status,"",
  "Run ID: "+r.runId+" · Commit: "+r.commit+".","",
  "**Result:** "+(r.ok?"PASS (software lab)":"BLOCKED")+
  ". Runtime: "+r.profile.platform+"/"+r.profile.arch+", "+r.profile.node+".","",
  "## Assertions","",
  "| Stage | Check | ms |","| --- | --- | ---: |",rows,"",
  "## Boundaries","",
  "Real localhost standalone daemon, worker, host OS fsync, SIGKILL/restart.",
  "**VIRTUAL WAN** and **in-memory, unauthenticated Cloud mock**.",
  "No physical WAN, flash power-cut, actual Cloud Lite, trusted identity or 72h guarantee.","",
  "Error: "+(r.error||"none")+".",""].join("\n");
}
function verifyBundle(dir){
 if(typeof dir!=="string"||!path.isAbsolute(dir))throw Error("M1_VERIFY_ABSOLUTE_DIR_REQUIRED");
 const r=JSON.parse(fs.readFileSync(path.join(dir,"report.json"),"utf8"));
 const rawTrace=fs.readFileSync(path.join(dir,"trace.ndjson"),"utf8");
 const trace=rawTrace.trim().split("\n").map(line=>JSON.parse(line));
 const m=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"),"utf8"));
 if(r.kind!=="PEF_M1_END_TO_END_EVIDENCE_V1"||r.schemaVersion!==1||
   m.kind!=="PEF_M1_BUNDLE_V1"||m.runId!==r.runId||m.commit!==r.commit||
   m.schemaVersion!==1||!Array.isArray(m.files)||m.files.length!==NAMES.length||
   !Array.isArray(r.checks)||r.checks.length!==IDS.length||trace.length!==IDS.length)
  throw Error("M1_SCHEMA_INVALID");
 if(!r.ok||r.status!=="M1_FUNCTIONAL_LAB_PASS"||
   r.limits?.physicalValidated!==false||r.limits?.realCloudValidated!==false||
   r.limits?.powerCutValidated!==false||r.limits?.cloudMock!==true||
   r.limits?.realProcessSigkill!==true||r.final?.pending!==0)
  throw Error("M1_SCOPE_OR_SCENARIO_NOT_ACCEPTED");
 for(let i=0;i<IDS.length;i++){
  if(r.checks[i]?.id!==IDS[i]||r.checks[i]?.pass!==true||
     trace[i]?.id!==IDS[i]||trace[i]?.pass!==true||
     trace[i]?.runId!==r.runId||trace[i]?.sequence!==i+1)
   throw Error("M1_REQUIRED_STAGE_MISSING:"+i);
 }
 const sums=[];
 for(let i=0;i<NAMES.length;i++){
  const name=NAMES[i],e=m.files[i];
  if(e.name!==name)throw Error("M1_MANIFEST_FILE_LIST_CHANGED");
  const data=fs.readFileSync(path.join(dir,name));
  if(e.size!==data.length||e.sha256!==digest(data))
   throw Error("M1_FILE_DIGEST_MISMATCH:"+name);
  sums.push(e.sha256+"  "+name);
 }
 if(fs.readFileSync(path.join(dir,"SHA256SUMS"),"utf8")!==sums.join("\n")+"\n")
  throw Error("M1_SHA256SUMS_TAMPERED");
 if(fs.readFileSync(path.join(dir,"summary.md"),"utf8")!==summarize(r))
  throw Error("M1_SUMMARY_NOT_DERIVED");
 return {kind:"PEF_M1_BUNDLE_VERIFICATION_V1",ok:true,runId:r.runId,
  commit:r.commit,stages:IDS.length,realCloud:false,physicalValidated:false};
}
async function createBundle({outputRoot=path.resolve("artifacts/m1")}={}){
 if(!path.isAbsolute(outputRoot))throw Error("M1_ROOT_ABSOLUTE_REQUIRED");
 fs.mkdirSync(outputRoot,{recursive:true});
 const runId=randomUUID(),dir=path.join(outputRoot,runId);
 fs.mkdirSync(dir,{recursive:false,mode:0o700});
 const {report,trace}=await runM1Scenario({runId});
 const parts={
  "report.json":json(report),
  "trace.ndjson":trace.map(x=>JSON.stringify(x)).join("\n")+"\n",
  "summary.md":summarize(report)
 };
 const descriptors=[];
 for(const name of NAMES){
  const data=Buffer.from(parts[name]);
  fs.writeFileSync(path.join(dir,name),data,{mode:0o600});
  descriptors.push({name,size:data.length,sha256:digest(data)});
 }
 const manifest={kind:"PEF_M1_BUNDLE_V1",schemaVersion:1,runId,commit:report.commit,
  createdAt:new Date().toISOString(),files:descriptors,limits:report.limits};
 fs.writeFileSync(path.join(dir,"manifest.json"),json(manifest),{mode:0o600});
 fs.writeFileSync(path.join(dir,"SHA256SUMS"),
  descriptors.map(x=>x.sha256+"  "+x.name).join("\n")+"\n",{mode:0o600});
 const verification=report.ok?verifyBundle(dir):null;
 return {dir,report,verification};
}
module.exports={createBundle,verifyBundle,summarize};
