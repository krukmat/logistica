"use strict";
// One canonical M3 managed-Edge recovery run -> technical bundle and read-only visual replay.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createHash,randomUUID}=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {runM3RecoverySmoke}=require("../emulator/lab/m3-recovery-smoke.js");
const NAMES=["report.json","trace.ndjson","summary.md","m3-operations.html"];
const REQUIRED=["READY","CONFIG_COMMITTED","CONFIG_ROLLED_BACK",
 "RESTART_BUDGET_EXHAUSTED","SAFE_MODE_ENTERED","LOCAL_RECOVERY_REQUESTED","STOPPED"];
const sha=x=>createHash("sha256").update(x).digest("hex");
const json=x=>JSON.stringify(x,null,2)+"\n";
const escape=x=>String(x).replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function getCommit(){
 try{return execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",timeout:3000}).trim();}
 catch{return "UNAVAILABLE_NO_GIT";}
}
function summary(report){
 return ["# M3.5/M3.6 — "+report.status,"",
  "Run ID: "+report.runId+" · Commit: "+report.commit,
  "Host: "+report.host.platform+"/"+report.host.arch+" · Node: "+report.host.node,"",
  "## Controles M3.3/4 reutilizados","",
  ...Object.entries(report.checks).map(([k,v])=>"- "+k+": "+(v?"PASS":"FAIL")),"",
  "## Diagnósticos operativos","",
  ...report.diagnostics.map(s=>"- "+s.stage+": "+s.phase+
    " · revision "+s.policyRevision+" · "+s.health),"",
  "## Alcance","",
  "Proceso Edge real, journal host fsync, revisiones, rollback, SIGKILL y SAFE_MODE en LAB.",
  "WAN virtual · No Cloud Lite, firma de configuración, kernel lock local, powercut ni hardware.",
  "Vídeo opcional = animación de esta evidencia, NO filmación de dispositivo.",""].join("\n");
}
function viewer(report,trace){
 const cards=trace.map((e,i)=>'<section class="step" data-stage="'+escape(e.type)+'"><b class="number">'+
  String(i+1).padStart(2,"0")+'</b><span>'+escape(e.type)+'</span></section>').join("\n");
 const states=report.diagnostics.map(s=>'<article><strong>'+escape(s.stage)+'</strong><span>'+
  escape(s.phase)+' · '+escape(s.health)+' · rev '+escape(s.policyRevision)+
  ' · restarts '+escape(s.restartCount)+'</span></article>').join("\n");
 return ['<!doctype html><html lang="es"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>PEF M3 Operational Evidence</title>',
  '<style>*{box-sizing:border-box}body{margin:0;background:#0d1723;color:#eef5fa;font:16px system-ui,sans-serif}',
  'main{max-width:1020px;margin:26px auto;padding:0 18px}header{padding:24px;background:#183344;border-radius:12px}',
  'h1{margin:8px 0;font-size:32px}p{color:#c2d5df;font-size:14px}.tag{color:#88e9c4;font-size:12px;letter-spacing:2px}',
  '.warning{padding:14px;margin:18px 0;color:#f8d18c;border:1px solid #8e6a32;background:#2e281d;border-radius:9px}',
  'h2{font-size:19px;margin:26px 0 12px}article,.step{display:flex;gap:16px;padding:11px 16px;border-radius:8px;',
  'margin:8px 0;background:#193041;border:1px solid #355364}article strong{min-width:175px;color:#95ebc7}',
  '.number{color:#7dddb8;min-width:32px}.step{transition:opacity .3s,border-color .3s}',
  '.step.hidden-step{opacity:.12}.step.active{border-color:#7dddb8;background:#235041}',
  '.meta{font-size:12px;word-break:break-word}</style></head>',
  '<body><main data-run-id="'+escape(report.runId)+'"><header><div class="tag">PRIVATE EDGE FABRIC · M3</div>',
  '<h1>Supervisor autónomo y recuperación</h1><p>'+escape(report.status)+
  ' · '+escape(report.host.platform)+'/'+escape(report.host.arch)+'</p>',
  '<p class="meta">Run: '+escape(report.runId)+' · Commit: '+escape(report.commit)+'</p></header>',
  '<div class="warning">LAB ONLY · WAN VIRTUAL · CONFIG NO FIRMADA · SIN CORTE ELÉCTRICO NI HARDWARE VALIDADO</div>',
  '<h2>Diagnóstico operativo del mismo proceso</h2>',states,
  '<h2>Eventos trazados de la misma ejecución</h2>',cards,
  '<p>Visualización estática de report.json y trace.ndjson. Verificar hashes con npm run m3:bundle:verify.</p>',
  '</main></body></html>'].join("\n");
}
function validateReport(report,trace){
 if(report.kind!=="PEF_M3_OPERATIONS_EVIDENCE_V1"||report.schemaVersion!==1||
  !report.ok||report.status!=="M3_OPERATIONS_LAB_PASS"||
  Object.keys(report.checks||{}).length!==10||
  !Object.values(report.checks).every(v=>v===true)||
  !Array.isArray(report.diagnostics)||report.diagnostics.length!==4||
  !Array.isArray(trace)||trace.length<REQUIRED.length||
  trace.some((e,i)=>e.runId!==report.runId||e.sequence!==i+1)||
  REQUIRED.some(type=>!trace.some(e=>e.type===type))||
  report.limits?.physicalValidated!==false||
  report.limits?.cloudReal!==false||
  report.limits?.powerCutValidated!==false||
  report.limits?.signedConfigValidated!==false||
  report.diagnostics.some(x=>x.physicalValidated!==false||
    x.kind!=="PEF_M3_OPERATIONAL_DIAGNOSTICS_V1"))
  throw Error("M3_OPERATIONS_SCOPE_OR_STAGE_INVALID");
 const stages=report.diagnostics.map(x=>x.stage);
 if(stages.join(",")!=="INITIAL,CONFIG_COMMITTED,SAFE_MODE,LOCAL_RECOVERED"||
  report.diagnostics[0].phase!=="RUNNING"||
  report.diagnostics[1].policyRevision!==2||
  report.diagnostics[2].phase!=="SAFE_MODE"||
  report.diagnostics[2].safeModeReason!=="RESTART_BUDGET_EXHAUSTED"||
  report.diagnostics[3].phase!=="RUNNING")throw Error("M3_DIAGNOSTICS_STAGE_INVALID");
}
function verifyBundle(dir){
 if(!path.isAbsolute(dir))throw Error("M3_ABSOLUTE_PATH_REQUIRED");
 const report=JSON.parse(fs.readFileSync(path.join(dir,"report.json"),"utf8"));
 const raw=fs.readFileSync(path.join(dir,"trace.ndjson"),"utf8").trim();
 const trace=raw.split("\n").map(x=>JSON.parse(x));
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"),"utf8"));
 validateReport(report,trace);
 if(manifest.kind!=="PEF_M3_OPERATIONS_BUNDLE_V1"||
  manifest.runId!==report.runId||manifest.commit!==report.commit||
  manifest.files.length!==NAMES.length)throw Error("M3_MANIFEST_INVALID");
 const sums=[];
 for(let i=0;i<NAMES.length;i++){
  const name=NAMES[i],spec=manifest.files[i],data=fs.readFileSync(path.join(dir,name));
  if(spec.name!==name||spec.bytes!==data.length||spec.sha256!==sha(data))
   throw Error("M3_DIGEST_MISMATCH:"+name);
  sums.push(spec.sha256+"  "+name);
 }
 if(fs.readFileSync(path.join(dir,"SHA256SUMS"),"utf8")!==sums.join("\n")+"\n"||
  fs.readFileSync(path.join(dir,"summary.md"),"utf8")!==summary(report)||
  fs.readFileSync(path.join(dir,"m3-operations.html"),"utf8")!==viewer(report,trace))
  throw Error("M3_DERIVED_EVIDENCE_MISMATCH");
 return {kind:"PEF_M3_OPERATIONS_VERIFIED_V1",ok:true,runId:report.runId,commit:report.commit,
  events:trace.length,diagnostics:report.diagnostics.length,physicalValidated:false};
}
async function createBundle({outputRoot=path.resolve("artifacts/m3")}={}){
 if(!path.isAbsolute(outputRoot))throw Error("M3_OUTPUT_ROOT_ABSOLUTE_REQUIRED");
 fs.mkdirSync(outputRoot,{recursive:true});
 const dir=fs.mkdtempSync(path.join(outputRoot,"run-"),{encoding:"utf8"});
 try{
  const smoke=await runM3RecoverySmoke();
  const runId=randomUUID(),commit=getCommit();
  const report={kind:"PEF_M3_OPERATIONS_EVIDENCE_V1",schemaVersion:1,
   runId,commit,createdAt:new Date().toISOString(),ok:smoke.ok,
   status:smoke.ok?"M3_OPERATIONS_LAB_PASS":"BLOCKED",
   host:{platform:process.platform,arch:process.arch,node:process.version},
   checks:smoke.checks,diagnostics:smoke.diagnosticSnapshots,
   limits:{physicalValidated:false,cloudReal:false,powerCutValidated:false,
    signedConfigValidated:false,kernelLockValidatedHere:false,configScope:"SUPERVISOR_POLICY_ONLY"}};
  const trace=smoke.events.map((type,i)=>({runId,sequence:i+1,type}));
  validateReport(report,trace);
  const parts={"report.json":json(report),
   "trace.ndjson":trace.map(x=>JSON.stringify(x)).join("\n")+"\n",
   "summary.md":summary(report),"m3-operations.html":viewer(report,trace)};
  const files=NAMES.map(name=>{
   const data=Buffer.from(parts[name]);fs.writeFileSync(path.join(dir,name),data,{mode:0o600});
   return {name,bytes:data.length,sha256:sha(data)};
  });
  fs.writeFileSync(path.join(dir,"manifest.json"),json({kind:"PEF_M3_OPERATIONS_BUNDLE_V1",
   schemaVersion:1,runId,commit,files}),{mode:0o600});
  fs.writeFileSync(path.join(dir,"SHA256SUMS"),
   files.map(x=>x.sha256+"  "+x.name).join("\n")+"\n",{mode:0o600});
  return {dir,report,verification:verifyBundle(dir)};
 }catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e;}
}
async function recordVideo(dir){
 const verified=verifyBundle(dir);
 let playwright;
 try{playwright=require("playwright");}
 catch{throw Error("M3_VIDEO_NEEDS_PLAYWRIGHT_AND_CHROMIUM");}
 const browser=await playwright.chromium.launch({headless:true});
 let ctx=null;
 try{
  ctx=await browser.newContext({viewport:{width:1280,height:900},
   recordVideo:{dir,size:{width:1280,height:900}},deviceScaleFactor:1});
  const page=await ctx.newPage(),video=page.video();
  await page.goto("file://"+path.join(dir,"m3-operations.html"));
  if(await page.locator("main").getAttribute("data-run-id")!==verified.runId)
   throw Error("M3_VIDEO_RUN_MISMATCH");
  const count=await page.locator(".step").count();
  if(count!==verified.events)throw Error("M3_VIDEO_EVENTS_MISMATCH");
  await page.evaluate(()=>document.querySelectorAll(".step").forEach(e=>e.classList.add("hidden-step")));
  await page.waitForTimeout(1500);
  for(let i=0;i<count;i++){
   await page.evaluate(j=>document.querySelectorAll(".step").forEach((e,k)=>{
    e.classList.toggle("hidden-step",k>j);e.classList.toggle("active",k===j);
   }),i);
   await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1500);
  await ctx.close();ctx=null;
  await video.saveAs(path.join(dir,"m3-operations.webm"));
 }finally{if(ctx)await ctx.close().catch(()=>{});await browser.close();}
 const data=fs.readFileSync(path.join(dir,"m3-operations.webm"));
 fs.writeFileSync(path.join(dir,"video-manifest.json"),json({
  kind:"PEF_M3_OPERATIONS_VIDEO_V1",runId:verified.runId,commit:verified.commit,
  source:"SAME_RUN_READ_ONLY_HTML_PLAYWRIGHT",name:"m3-operations.webm",
  bytes:data.length,sha256:sha(data),physicalValidated:false,
  note:"Evidence timeline, NOT physical appliance footage"}),{mode:0o600});
 return verifyVideo(dir);
}
function verifyVideo(dir){
 const bundle=verifyBundle(dir);
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,"video-manifest.json"),"utf8"));
 const video=fs.readFileSync(path.join(dir,"m3-operations.webm"));
 if(manifest.kind!=="PEF_M3_OPERATIONS_VIDEO_V1"||
  manifest.runId!==bundle.runId||manifest.commit!==bundle.commit||
  manifest.source!=="SAME_RUN_READ_ONLY_HTML_PLAYWRIGHT"||
  manifest.name!=="m3-operations.webm"||manifest.physicalValidated!==false||
  manifest.bytes!==video.length||manifest.sha256!==sha(video)||
  video.length<16384||!video.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))
  throw Error("M3_VIDEO_INTEGRITY_INVALID");
 return {kind:"PEF_M3_OPERATIONS_VIDEO_VERIFIED_V1",ok:true,
  runId:bundle.runId,bytes:video.length,sha256:manifest.sha256,physicalValidated:false};
}
module.exports={createBundle,verifyBundle,recordVideo,verifyVideo,validateReport};
