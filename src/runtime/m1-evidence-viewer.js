"use strict";
// Static, read-only visualization of the exact M1 report and trace; no fabricated transitions.
const escape=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function renderViewer(report,trace){
 if(report?.kind!=="PEF_M1_END_TO_END_EVIDENCE_V1"||
  !Array.isArray(trace)||trace.some(x=>x.runId!==report.runId))
   throw Error("M1_VISUAL_MISMATCHED_REPORT_TRACE");
 const titles=[
  "Servicio autónomo activo","Operación local sin Internet",
  "Recepción persistida con fsync","Idempotencia y rechazo de conflictos",
  "SIGKILL y reinicio del proceso","Reconexión y ACK remoto perdido",
  "Replay, deduplicación y sincronización"
 ];
 const cards=trace.map((event,i)=>{
  const details=Object.entries(event.data||{}).map(([key,value])=>
   '<span class="datum"><span class="key">'+escape(key)+'</span><b>'+escape(value===null?"null":value)+'</b></span>').join("");
  return '<section class="step" data-sequence="'+(i+1)+'" data-stage="'+escape(event.id)+'">'+
   '<div class="number">'+String(i+1).padStart(2,"0")+'</div><div class="step-body"><div class="step-heading">'+
   '<h2>'+escape(titles[i]||event.id)+'</h2><span class="'+(event.pass?"pass":"fail")+'">'+
   (event.pass?"PASS":"FAIL")+'</span></div><div class="detail">'+details+'</div></div></section>';
 }).join("\n");
 return ['<!doctype html><html lang="es"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>PEF — M1 Evidence · '+escape(report.runId)+'</title>',
  '<style>',
  '*{box-sizing:border-box}body{margin:0;background:#09121e;color:#eff6ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}',
  '.page{width:min(1080px,94vw);margin:26px auto 45px}',
  '.top{display:flex;justify-content:space-between;align-items:center;gap:22px;padding:20px 26px;border:1px solid #264256;border-radius:14px;background:#112538}',
  '.eyebrow{font-size:12px;letter-spacing:.17em;text-transform:uppercase;color:#69dfbb;font-weight:800}',
  'h1{font-size:33px;line-height:1.08;margin:8px 0 10px}h2{font-size:16px;margin:0}p{margin:6px 0}',
  '.sub{color:#a9bfd2;font-size:13px}.result{border:1px solid #2c966d;background:#124634;border-radius:9px;color:#8ffac7;font-size:17px;font-weight:900;padding:12px 18px;white-space:nowrap}',
  '.disclaimer{margin:18px 0;padding:12px 16px;border:1px solid #795f25;border-radius:9px;color:#f5d07c;font-size:13px;background:#252114;font-weight:700}',
  '.timeline{display:grid;grid-template-columns:1fr;gap:9px}',
  '.step{display:flex;gap:16px;border:1px solid #29475e;background:#132739;border-radius:12px;padding:13px 18px;min-height:78px;transition:opacity .35s,background .35s,border-color .35s}',
  '.step.active{background:#16493b;border-color:#68ebb8}.step.hidden-step{opacity:.12}',
  '.number{font-size:22px;font-weight:900;color:#7ad9bb;width:34px;flex-shrink:0}',
  '.step-body{flex:1;min-width:0}.step-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}',
  '.pass{color:#74efb1;border:1px solid #3b9877;padding:3px 7px;border-radius:5px;font-size:11px;font-weight:800}',
  '.fail{color:#ffc5c5;border:1px solid #ad5a5a;padding:3px 7px;border-radius:5px;font-size:11px;font-weight:800}',
  '.detail{display:flex;gap:12px;flex-wrap:wrap;margin-top:9px}.datum{display:inline-flex;gap:5px;max-width:260px;font-size:11px}',
  '.datum b{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e6f3ff}',
  '.key{color:#84a7bc;white-space:nowrap}.footer{margin-top:20px;color:#86a8bf;font-size:12px;line-height:1.5}',
  '@media(max-width:650px){h1{font-size:26px}.top{display:block}.result{display:inline-block;margin-top:10px}.detail{gap:8px}}',
  '</style></head><body><main class="page" data-run-id="'+escape(report.runId)+'">',
  '<header class="top"><div><div class="eyebrow">Private Edge Fabric / M1 Evidence</div>',
  '<h1>Operación local que sobrevive a la desconexión</h1>',
  '<p class="sub">Run: '+escape(report.runId)+' · Commit: '+escape(report.commit.slice(0,12))+
   ' · '+escape(report.profile.platform)+'/'+escape(report.profile.arch)+'</p></div>',
  '<div class="result">'+escape(report.status)+'</div></header>',
  '<div class="disclaimer">LABORATORIO: WAN VIRTUAL · CLOUD MOCK EFÍMERO · NO CERTIFICA HARDWARE NI CORTES ELÉCTRICOS</div>',
  '<div class="timeline">'+cards+'</div>',
  '<div class="footer">Esta representación usa exclusivamente report.json y trace.ndjson de la misma ejecución. '+
   'Verifique los hashes y las aserciones del paquete para una comprobación técnica. '+
   'Sin Cloud real, mTLS, WAN física, persistencia ante powercut ni 72 horas offline.</div>',
  '</main></body></html>'].join("\n");
}
module.exports={renderViewer};
