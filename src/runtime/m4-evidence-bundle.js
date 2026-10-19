"use strict";
// Single-run, local-only M4 evidence: integrity SHA-256, not signer authenticity.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createHash}=require("node:crypto");
const {isDeepStrictEqual}=require("node:util");
const {runM4Integrated,validateIntegrated,buildTrace}=require("./m4-integrated.js");
const NAMES=Object.freeze(["report.json","events.ndjson","summary.md","m4-integrated.html"]);
const sha=data=>createHash("sha256").update(data).digest("hex");
const json=obj=>JSON.stringify(obj,null,2)+"\n";
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function summary(report,trace){
 const total=trace.length;
 const metrics=report.commonality.source;
 const rows=["# PEF M4 — software lab "+report.status,"",
  "Run ID: "+report.runId,"Commit: "+report.commit,
  "Host: "+report.hostEnvironment.platform+"/"+report.hostEnvironment.arch+
    " · Node "+report.hostEnvironment.node,"",
  "## Resultados ejecutados",
  "- Property: "+report.property.status+"; "+Object.keys(report.property.checks).length+" checks; "+report.property.eventsAfterReplay+" pendientes",
  "- Host: "+report.host.status+"; "+Object.keys(report.host.checks).length+" checks; "+report.host.eventsAfterReplay+" pendientes",
  "- Commonality: "+report.commonality.status+"; paridad/resiliencia ambos perfiles",
  "- Aserciones del paquete: "+total+" PASS (NO raw journal stream)","",
  "## Código compartido — muestra, no producto",
  "- "+metrics.sharedLines+" LOC en "+metrics.sharedFiles+" archivos comunes seleccionados",
  "- "+metrics.propertyCompatibilityLines+" LOC de fachada Property",
  "- "+metrics.selectedRuntimeSharePercent+"% sólo sobre archivos activos seleccionados, NO arquitectura completa","",
  "## Limitaciones",
  "- Node workers sólo NODE_PROCESS_ONLY, sin aislamiento kernel de Property/Host.",
  "- WAN sintética, Cloud local mock, fsync host; NO hardware, powercut ni 72h probadas.",
  "- SHA-256 verifica integridad relativa al manifiesto, NO autenticidad/firma del operador.",
  "- events.ndjson son CHECKPOINTS de aserciones, NO el journal OS en bruto.",
  "- Métricas de M4.3 = 1 escenario sintético por perfil, NO SLA.",""];
 return rows.join("\n");
}
function viewer(report,trace){
 const groups=[["Property",report.property],["Host",report.host]];
 const boxes=groups.map(([name,r])=>'<article><h2>'+esc(name)+'</h2><p class="ok">'+
   esc(r.status)+'</p><p>'+Object.keys(r.checks).length+' checks · '+r.eventsAfterReplay+
   ' pendientes tras Cloud mock</p><p>worker '+esc(r.worker)+'</p></article>').join("");
 const metrics=["property","host"].map(name=>{
   const m=report.commonality.profiles[name].runtime.observedMetrics;
   return '<tr><th>'+esc(name)+'</th><td>'+esc(m.workerBefore.rssBytes)+
    '</td><td>'+esc(m.openHttpMs)+'</td><td>'+esc(m.ackHttpMs)+'</td><td>'+
    esc(m.restartObserveMs)+'</td></tr>';
 }).join("");
 const stages=[...new Set(trace.map(e=>e.stage))];
 const checks=stages.map(stage=>{
   const rows=trace.filter(x=>x.stage===stage).map(x=>'<li><code>'+esc(x.profile)+
     '</code> '+esc(x.check)+' <b>PASS</b></li>').join("");
   return '<details><summary>'+esc(stage)+' — '+trace.filter(x=>x.stage===stage).length+
     ' checks</summary><ul>'+rows+'</ul></details>';
 }).join("");
 return ['<!doctype html><html lang="es"><head><meta charset="utf-8">',
   '<meta name="viewport" content="width=device-width,initial-scale=1">',
   '<title>PEF M4 · Evidence</title>',
   '<style>body{font:15px system-ui,sans-serif;background:#101924;color:#eef2f6;margin:0}',
   'main{max-width:1020px;margin:24px auto;padding:0 20px}header,article,details{background:#1b2c3d;',
   'border:1px solid #345166;border-radius:10px;padding:17px;margin:12px 0}',
   'h1{margin:4px 0;font-size:30px}.ok{color:#93e8b9;font-weight:700}',
   '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}',
   '.warning{padding:14px;color:#f9d8a2;border:1px solid #957038;background:#342b1d;border-radius:8px}',
   'table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}',
   'td,th{border-bottom:1px solid #345166;text-align:left;padding:10px}',
   'summary{cursor:pointer}li{padding:3px 0}code{color:#a7cffe}',
   'small{color:#b9d0df;overflow-wrap:anywhere}</style></head>',
   '<body><main data-run-id="'+esc(report.runId)+'"><header><small>PRIVATE EDGE FABRIC · M4 · LAB ONLY</small>',
   '<h1>Property + Host</h1><p class="ok">'+esc(report.status)+
   '</p><small>Run '+esc(report.runId)+' · commit '+esc(report.commit)+'</small></header>',
   '<p class="warning">SOFTWARE LAB ONLY · WAN sintética · Cloud mock · fsync host. '+
   'Sin hardware, corte eléctrico, cuotas kernel de Property/Host ni firma digital. '+
   'El HTML no autentica la procedencia; ejecutar la verificación externa del bundle.</p>',
   '<section class="cards">',boxes,'</section>',
   '<h2>Mediciones puntuales (NO SLA)</h2><table><thead><tr><th>Overlay</th>',
   '<th>RSS (bytes)</th><th>Apertura (ms)</th><th>ACK (ms)</th><th>Reinicio (ms)</th>',
   '</tr></thead><tbody>',metrics,'</tbody></table>',
   '<h2>Aserciones observadas ('+trace.length+')</h2>',checks,
   '<p><small>events.ndjson registra aserciones del runner, no eventos de journal en bruto. '+
   'SHA-256 no equivale a firma. Reproducir/verificar: npm run m4:bundle:verify -- &lt;dir&gt;.</small></p>',
   '</main></body></html>'].join("");
}
function validateTrace(report,trace){
 validateIntegrated(report);
 if(!Array.isArray(trace)||trace.length!==92||
   trace.some((x,i)=>x.runId!==report.runId||x.sequence!==i+1||
     x.kind!=="ASSERTION"||x.source!=="SCENARIO_CHECK_NOT_RAW_JOURNAL_EVENT"||
     x.pass!==true)||!isDeepStrictEqual(trace,buildTrace(report)))
   throw Error("M4_TRACE_OR_REPORT_INCONSISTENT");
}
function mustRegular(dir,name){
 const file=path.join(dir,name);
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error("M4_BUNDLE_FILE_NOT_REGULAR:"+name);
 return fs.readFileSync(file);
}
function verifyBundle(dir){
 if(!path.isAbsolute(dir)||!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())
   throw Error("M4_BUNDLE_DIR_INVALID");
 const manifest=JSON.parse(mustRegular(dir,"manifest.json"));
 if(manifest.kind!=="PEF_M4_EVIDENCE_MANIFEST_V1"||manifest.schemaVersion!==1||
   manifest.integrity!=="SHA256_NOT_SIGNATURE"||!Array.isArray(manifest.files)||
   manifest.files.length!==NAMES.length||!Number.isSafeInteger(manifest.assertions)||
   Object.keys(manifest).sort().join(",")!=="assertions,commit,files,integrity,kind,runId,schemaVersion")
   throw Error("M4_MANIFEST_INVALID");
 const actual=fs.readdirSync(dir).sort();
 const allowed=[...NAMES,"manifest.json","SHA256SUMS"].sort();
 if(!isDeepStrictEqual(actual,allowed))throw Error("M4_BUNDLE_FILES_UNEXPECTED");
 const sums=[];
 for(let i=0;i<NAMES.length;i++){
   const name=NAMES[i],entry=manifest.files[i],data=mustRegular(dir,name);
   if(!entry||Object.keys(entry).sort().join(",")!=="bytes,name,sha256"||
     entry.name!==name||entry.bytes!==data.length||entry.sha256!==sha(data))
     throw Error("M4_BUNDLE_DIGEST_MISMATCH:"+name);
   sums.push(entry.sha256+"  "+name);
 }
 if(mustRegular(dir,"SHA256SUMS").toString("utf8")!==sums.join("\n")+"\n")
   throw Error("M4_SUMS_MISMATCH");
 const report=JSON.parse(mustRegular(dir,"report.json").toString("utf8"));
 const text=mustRegular(dir,"events.ndjson").toString("utf8");
 if(!text.endsWith("\n"))throw Error("M4_TRACE_FORMAT_INVALID");
 const trace=text.trim().split("\n").map(x=>JSON.parse(x));
 validateTrace(report,trace);
 if(manifest.runId!==report.runId||manifest.commit!==report.commit||
   manifest.assertions!==trace.length)throw Error("M4_MANIFEST_REPORT_MISMATCH");
 if(mustRegular(dir,"summary.md").toString("utf8")!==summary(report,trace)||
   mustRegular(dir,"m4-integrated.html").toString("utf8")!==viewer(report,trace))
   throw Error("M4_DERIVED_EVIDENCE_MISMATCH");
 return {kind:"PEF_M4_BUNDLE_VERIFIED_V1",ok:true,status:"LAB_PASS",
   runId:report.runId,commit:report.commit,assertions:trace.length,files:NAMES.length,
   integrity:"SHA256_NOT_SIGNATURE",physicalValidated:false};
}
async function createBundle({outputRoot=path.resolve("artifacts/m4")}={}){
 if(!path.isAbsolute(outputRoot))throw Error("M4_BUNDLE_ROOT_ABSOLUTE_REQUIRED");
 fs.mkdirSync(outputRoot,{recursive:true});
 if(fs.lstatSync(outputRoot).isSymbolicLink())throw Error("M4_BUNDLE_ROOT_SYMLINK_DENIED");
 const dir=fs.mkdtempSync(path.join(outputRoot,"run-"));
 try{
   const {report,trace}=await runM4Integrated();
   validateTrace(report,trace);
   const pieces={"report.json":json(report),
     "events.ndjson":trace.map(x=>JSON.stringify(x)).join("\n")+"\n",
     "summary.md":summary(report,trace),"m4-integrated.html":viewer(report,trace)};
   const files=NAMES.map(name=>{
     const data=Buffer.from(pieces[name]);fs.writeFileSync(path.join(dir,name),data,{mode:0o600,flag:"wx"});
     return {name,bytes:data.length,sha256:sha(data)};
   });
   fs.writeFileSync(path.join(dir,"manifest.json"),json({
     kind:"PEF_M4_EVIDENCE_MANIFEST_V1",schemaVersion:1,runId:report.runId,
     commit:report.commit,integrity:"SHA256_NOT_SIGNATURE",assertions:trace.length,files
   }),{mode:0o600,flag:"wx"});
   fs.writeFileSync(path.join(dir,"SHA256SUMS"),
     files.map(x=>x.sha256+"  "+x.name).join("\n")+"\n",{mode:0o600,flag:"wx"});
   return {dir,report,trace,verification:verifyBundle(dir)};
 }catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e;}
}
module.exports={createBundle,verifyBundle,summary,viewer,validateTrace,NAMES};
