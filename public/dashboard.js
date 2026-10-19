"use strict";
const $=id=>document.getElementById(id);
let token=null,current=null,currentLab=null,currentMode="sim",busy=false,eventSeq=0;
function labelState(node,state){
  node.querySelector(".region-value").textContent=String(state.state||"—");
  node.classList.toggle("active",["HEALTHY","MULTI_WAN_HEALTHY","CONNECTED","ONLINE","READY","RUNNING","SECURE","IDLE"].includes(state.state));
  node.classList.toggle("warn",["LOCAL_ONLY","CLOUD_DISCONNECTED","PRESSURE","ISOLATED"].includes(state.state));
  node.classList.toggle("bad",["CRITICAL","FULL","REMOTE_ISOLATED"].includes(state.state));
}
function setText(id,value){$(id).textContent=String(value);}
function render(session,lab,mode="sim"){
  current=session;currentLab=lab;currentMode=mode;
  const st=session.state,regions=session.chart.regions;
  for(const name of ["core","connectivity","cloud","journal","runtime","security"]){labelState($("region-"+name),regions[name]);}
  setText("scenario-title",session.scenario_id);
  setText("clock","t = "+st.clock+" s");
  setText("active-wan",st.selectedWan?st.selectedWan.toUpperCase():"LOCAL_ONLY");
  setText("progress",session.cursor+" / "+session.totalSteps+" steps");
  setText("journal-metrics",st.p1Used+" / "+st.p1CapacityBytes+" bytes · "+st.pendingEvents+" pending");
  $("journal-progress").style.width=Math.min(100,100*st.p1Used/Math.max(1,st.p1CapacityBytes))+"%";
  const wans=st.wans||[];
  for(const [name,id] of [["primary","a"],["backup","b"]]){
    const w=wans.find(x=>x.id===name)||{link:false,upstream:false};
    const online=w.link&&w.upstream;
    const card=$(name==="primary"?"primary-node":"backup-node");
    card.classList.toggle("good",online);card.classList.toggle("down",!online);
    setText("wan-"+id+"-state",online?"UP":"DOWN");
    setText("wan-"+id+"-descr",online?"Upstream disponible":"Upstream inaccesible");
    setText("toggle-"+name,online?"Cortar upstream":"Restaurar");
  }
  setText("cloud-descr",st.cloudAvailable?(st.cloud==="ONLINE"?"Cloud virtual conectado":"Cloud disponible, WAN o trust no operativo"):"Cloud virtual desconectado");
  setText("toggle-cloud",st.cloudAvailable?"Desconectar":"Restaurar");
  $("next").disabled=busy||session.halted||session.cursor>=session.totalSteps;
  $("run").disabled=busy||session.halted||session.cursor>=session.totalSteps;
  $("back").disabled=busy||session.cursor===0;
  const t=$("timeline");t.replaceChildren();
  if(!session.history.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent="Todavía no hay eventos";tr.append(td);t.append(tr);}
  else for(const item of session.history.slice(-100)){
    const tr=document.createElement("tr");tr.title="Retroceder al paso "+item.index;
    const cols=[String(item.index+1),item.action,item.ok?"PASS":"FAIL · "+item.error,
      item.transitions.map(x=>x.region+": "+x.from+" → "+x.to+(x.wanAfter!==undefined?" ("+x.wanAfter+")":"")).join(" | ")||"—"];
    for(const [i,value] of cols.entries()){const td=document.createElement("td");td.textContent=value;if(i===2)td.className=item.ok?"ok":"fail";tr.append(td);}
    tr.addEventListener("click",()=>dispatch({command:"rewind",cursor:item.index}));t.append(tr);
  }
  $("trace").textContent=JSON.stringify(session.trace.slice(-18),null,2);
  if(session.halted&&mode==="sim")message("Escenario detenido: assertion o acción fallida. Retrocede o reinicia.",true);
  const integrated=mode==="lab";
  $("lab-panel").hidden=!integrated;
  $("sim-runner").hidden=integrated;
  $("mode-sim").className=integrated?"secondary":"primary";
  $("mode-lab").className=integrated?"primary":"secondary";
  setText("mode-description",integrated?
    "Journal temporal fsync + Cloud mock; sin privilegios ni hardware":
    "Tiempo lógico · datos en memoria");
  for(const name of ["next","run","back","reset","load","scenario-select","append-event","power-cut","rollback-config"])
    $(name).disabled=integrated||$(name).disabled;
  // Re-enable controls in the pure simulator after switching back.
  if(!integrated){
    $("load").disabled=false;$("scenario-select").disabled=false;
    for(const id of ["append-event","power-cut","rollback-config"])$(id).disabled=false;
  }
  if(integrated&&lab)renderIntegrated(lab);
}
function renderIntegrated(lab){
  const net=lab.network,store=lab.storage,online=lab.cloud.connected;
  const regions={
    core:lab.runtimeHealth,connectivity:net.connectivity,
    cloud:online?"ONLINE":"CLOUD_DISCONNECTED",
    journal:store.unsafe?"CRITICAL":store.bytesUsed>=store.regularWriteLimitBytes?"FULL":
      store.bytesUsed/store.regularWriteLimitBytes>.85?"PRESSURE":"READY",
    runtime:"LAB_ONLY",security:"UNAUTHENTICATED"};
  for(const [name,state] of Object.entries(regions))labelState($("region-"+name),{state});
  setText("scenario-title","INTEGRATED_LAB / "+lab.profile.toUpperCase());
  setText("clock","t = "+net.clock+" s");
  setText("active-wan",net.selectedWan?net.selectedWan.toUpperCase():"LOCAL_ONLY");
  setText("journal-metrics",store.bytesUsed+" / "+store.capacityBytes+" bytes · "+store.pending+" pending");
  $("journal-progress").style.width=Math.min(100,100*store.bytesUsed/Math.max(1,store.capacityBytes))+"%";
  setText("journal-scope","P1 con fsync del SO, persistencia en directorio temporal; NO validación de corte eléctrico físico.");
  for(const [name,id] of [["primary","a"],["backup","b"]]){
    const w=lab.wans.find(x=>x.id===name);
    const up=Boolean(w?.link&&w?.upstream);
    const node=$(name+"-node");node.classList.toggle("good",up);node.classList.toggle("down",!up);
    setText("wan-"+id+"-state",up?"UP":"DOWN");
    setText("wan-"+id+"-descr",up?"Probe simulado alcanzable":"Probe sintético indisponible");
    setText("toggle-"+name,up?"Cortar upstream":"Restaurar");
  }
  setText("cloud-descr",online?"Cloud mock accesible (sin autenticación)":"Cloud mock sin conectividad");
  setText("toggle-cloud",lab.cloud.available?"Desconectar":"Restaurar");
  setText("lab-identity",lab.identity.siteId+" / "+lab.identity.deviceId);
  setText("lab-session",lab.identity.sessionId);
  setText("lab-revision",lab.identity.configRevision);
  setText("lab-storage",store.bytesUsed+" bytes · "+store.pending+" pendientes · "+store.cloudAcked+" ACK remotos");
  setText("lab-cloud-state",(online?"ONLINE":"OFFLINE")+" · "+lab.cloud.stored+" eventos mock");
  setText("lab-health",lab.runtimeHealth+" · "+lab.volatilePending+" volátiles · "+lab.droppedEvidence+" descartados");
  setText("lab-boot",lab.boot.metadataFsync?"metadata fsync · LAB_ONLY":"missing");
  setText("lab-protocol",lab.transport.frame+" · "+lab.transport.timeoutMs+" ms · proof mock");
  setText("lab-runtime-backend",lab.runtimeBackend.kind+" · shared PEF Core · route in memory");
  $("lab-profile").value=lab.profile;
  $("receipt-list").textContent=JSON.stringify(lab.receipts||[],null,2);
  const accepted=(lab.receipts||[]).length;
  const cloudAcked=(lab.receipts||[]).filter(r=>r.cloudAcked).length;
  setText("receipt-count",accepted+" recepciones locales · "+cloudAcked+" confirmadas en Cloud mock");
  $("edge-autonomous-evidence").textContent=JSON.stringify(lab.standaloneEdge,null,2);
  $("m3-lifecycle-evidence").textContent=JSON.stringify(lab.m3Lifecycle,null,2);
  $("m3-recovery-evidence").textContent=JSON.stringify(lab.m3Recovery,null,2);
  $("m3-operations-evidence").textContent=JSON.stringify(lab.m3Operations,null,2);
  $("m4-property-evidence").textContent=JSON.stringify(lab.property,null,2);
  $("m4-host-evidence").textContent=JSON.stringify(lab.host,null,2);
  $("m4-commonality-evidence").textContent=JSON.stringify(lab.m4Commonality,null,2);
  $("m4-integrated-evidence").textContent=JSON.stringify(lab.m4Integrated,null,2);
  $("m5-install-evidence").textContent=JSON.stringify(lab.m5Install,null,2);
  $("m54-systemd-evidence").textContent=JSON.stringify(lab.m54Systemd,null,2);
  $("m55-isolation-evidence").textContent=JSON.stringify(lab.m55Isolation,null,2);
  $("m56-integration-evidence").textContent=JSON.stringify(lab.m56Integration,null,2);
  $("predevice-evidence").textContent=JSON.stringify(lab.predevice,null,2);
  $("golden-traces-evidence").textContent=JSON.stringify(lab.goldenTraces,null,2);
  $("device-preflight-evidence").textContent=JSON.stringify(lab.devicePreflight,null,2);
  $("hardware-screening-evidence").textContent=JSON.stringify(lab.hardwareCandidates,null,2);
  $("workload-status").textContent=JSON.stringify(lab.workloads,null,2);
  if(lab.workloads.linuxCiEvidence)
    setText("workload-linux-evidence-status",lab.workloads.linuxCiEvidence.state);
  setText("workload-scope",lab.workloads.entries.length+
    " procesos supervisados · "+lab.workloads.reserved.memoryMiB+" MiB límite solicitado · "+
    "cgroups: "+(lab.workloads.actualLimitsEnforced?"ENFORCED":"NO ENFORCED")+
    " · aislamiento Linux: "+(lab.workloads.linuxIsolationValidated?"PASS":"NOT_RUN"));
  $("lab-pending").textContent=JSON.stringify(lab.pending,null,2);
  $("lab-history").textContent=JSON.stringify(lab.history.slice(-12),null,2);
  $("trace").textContent=JSON.stringify({mode:"integrated-lab",lastResult:lab.lastResult,
    recentActions:lab.history.slice(-8),physicalValidated:false,remoteAuthenticated:false},null,2);
}
function message(text,failed=false){
  for(const id of ["feedback","lab-feedback"]){
    $(id).textContent=text;$(id).classList.toggle("failed",failed);
  }
}
async function dispatch(command){
  if(busy||!token)return;
  busy=true;
  try{
    const res=await fetch("/api/command",{method:"POST",headers:{"content-type":"application/json","x-pef-session":token},body:JSON.stringify(command)});
    const data=await res.json();
    if(!res.ok||!data.ok)throw Error(data.error||"Command failed");
    render(data.session,data.lab,data.mode);
    if(data.result&&data.result.ok===false)message("Evento: "+(data.result.error||"rechazado"),true);
    else if(command.command==="mode")message(data.mode==="lab"?
      "Laboratorio integrado activo. Las pruebas se ejecutan en almacenamiento temporal local.":
      "Simulador lógico activo.");
    else if(command.command==="lab")message(command.action==="sample"?"Probe y journal reconciliados.":
      "Operación de laboratorio: "+command.action);
    else if(command.command==="load")message("Escenario cargado. Usa Paso siguiente o Ejecutar todo.");
    else message(command.command==="enqueue"?"Evento inyectado en el simulador.":"Estado actualizado.");
  }catch(err){message(String(err.message||err),true);}
  finally{busy=false;if(current)render(current,currentLab,currentMode);}
}
function inject(step){return dispatch({command:"enqueue",step});}
function labAction(action,options={}){return dispatch({command:"lab",action,...options});}
async function submitReceipt(){
  if(busy||!token||currentMode!=="lab")return;
  const receiptId=$("receipt-id").value.trim();
  const packageId=$("package-id").value.trim();
  busy=true;
  try{
    const res=await fetch("/api/local/receipts",{method:"POST",headers:{
      "content-type":"application/json","x-pef-session":token},
      body:JSON.stringify({receiptId,packageId})});
    const data=await res.json();
    if(data.session&&data.lab)render(data.session,data.lab,data.mode);
    if(!res.ok||!data.ok){
      message("Recepción no aceptada: "+(data.result?.error||data.error||res.status),true);
    }else message(data.result.duplicate?
      "Recepción duplicada (mismo evento): sin doble registro.":
      "Recepción guardada: ACK local tras fsync, sincronización Cloud pendiente.");
  }catch(err){message(String(err.message||err),true);}
  finally{busy=false;if(current)render(current,currentLab,currentMode);}
}
async function importArm64Comparison(file){
 const output=$("arm64-comparison-evidence");
 if(!file){output.textContent="D4 NOT_RUN · selecciona un informe local";return;}
 if(file.size>131072){output.textContent="Informe rechazado: límite 128 KiB";return;}
 try{
   const r=JSON.parse(await file.text());
   if(!r||r.kind!=="PEF_ARM64_VIRTUAL_FIT_COMPARISON_V1"||r.schemaVersion!==1||
      !["r28s-1g","r28s-768m","r28s-512m"].includes(r.profile)||
      !Array.isArray(r.checks)||r.checks.length!==7||
      r.limits?.deviceBackend!=="BACKEND_NOT_IMPLEMENTED"||
      r.limits?.procurementApproved!==false||r.limits?.physicalPowercutValidated!==false)
     throw Error("D4_INVALID_IMPORT");
   output.textContent=JSON.stringify({
     title:"PEF ARM64 · INFORME LOCAL NO AUTENTICADO",
     profile:r.profile,status:r.status,virtualVerdict:r.verdict,
     importedFromLocalFile:file.name,checks:r.checks,
     physicalHardwareApproved:false,reportIntegrityIndependentlyVerified:false,
     limitations:r.limits
   },null,2);
 }catch(err){output.textContent="Informe rechazado: "+String(err.message||err);}
}
async function importArm64E5(file){
 const output=$("arm64-e5-evidence");
 if(!file){output.textContent="E5 NOT_RUN · selecciona un JSON local";return;}
 if(file.size>131072){output.textContent="Informe E5 demasiado grande";return;}
 try{
  const r=JSON.parse(await file.text());
  if(r?.kind!=="PEF_W1_10_E5_VIRTUAL_HARDWARE_GATE_V1"||
     r.schemaVersion!==1||!Array.isArray(r.checks)||r.checks.length!==6||
     r.limitations?.deviceBackend!=="BACKEND_NOT_IMPLEMENTED"||
     r.limitations?.procurementApproved!==false||r.limitations?.physicalValidated!==false)
    throw Error("E5_INVALID_IMPORT");
  output.textContent=JSON.stringify({
   label:"E5 INFORME LOCAL NO AUTENTICADO",profile:r.profile,
   status:r.status,verdict:r.verdict,checks:r.checks,
   purchasedOrDeviceApproved:false,limitations:r.limitations
  },null,2);
 }catch(e){output.textContent="E5 rechazado: "+String(e.message||e);}
}
async function importArm64F1(file){
 const output=$("arm64-f1-evidence");
 if(!file){output.textContent="F1 NOT_RUN";return;}
 if(file.size>262144){output.textContent="F1 rechazado: tamaño excesivo";return;}
 try{
  const r=JSON.parse(await file.text());
  if(r.kind!=="PEF_F1_JOURNAL_INDEX_SCALE_V1"||r.schemaVersion!==1||
     !["smoke","full"].includes(r.mode)||!Array.isArray(r.stages)||r.stages.length>3||
     r.safety?.procurementApproved!==false||r.safety?.physicalValidated!==false||
     r.safety?.full518400EventsTested!==false)
    throw Error("F1_INVALID_IMPORT");
  output.textContent=JSON.stringify({source:"INFORME LOCAL NO AUTENTICADO",profile:r.profile,
   status:r.status,mode:r.mode,ok:r.ok,stages:r.stages,
   error:r.error,physicalValidated:false,retention72hProven:false},null,2);
 }catch(e){output.textContent="F1 rechazado: "+String(e.message||e);}
}
async function importArm64F2(file){
 const output=$("arm64-f2-evidence");
 if(!file){output.textContent="F2 NOT_RUN";return;}
 if(file.size>262144){output.textContent="F2 rechazado: tamaño excesivo";return;}
 try{
  const r=JSON.parse(await file.text());
  if(r.kind!=="PEF_F2_72H_RETENTION_POLICY_V1"||r.schemaVersion!==1||
     r.decision?.procurementApproved!==false||
     r.decision?.proposedPhysical72hAcceptance!==false||
     r.decision?.changeProductionJournalConfigAuthorized!==false)
    throw Error("F2_INVALID_IMPORT");
  output.textContent=JSON.stringify({source:"PROYECCIÓN LOCAL NO AUTENTICADA",profile:r.profile,
   status:r.status,projections:r.projections,checks:r.checks,
   currentEdge100MiBCapBlocks72h:r.decision.currentEdge100MiBCapBlocks72h,
   actual72hValidated:false,procurementApproved:false},null,2);
 }catch(e){output.textContent="F2 rechazado: "+String(e.message||e);}
}
const m1Import={report:null,trace:null};
async function importM1Evidence(which,file){
 const output=$("m1-evidence");
 if(!file){m1Import[which]=null;output.textContent="M1 NOT_IMPORTED";return;}
 if(file.size>262144){output.textContent="M1 FILE TOO LARGE";return;}
 try{
  const data=await file.text();
  const value=which==="report"?JSON.parse(data):data.trim().split("\n").map(x=>JSON.parse(x));
  m1Import[which]=value;
  const r=m1Import.report,t=m1Import.trace;
  if(!r||!t){output.textContent="M1: carga report.json y trace.ndjson";return;}
  if(r.kind!=="PEF_M1_END_TO_END_EVIDENCE_V1"||r.schemaVersion!==1||
     r.limits?.physicalValidated!==false||r.limits?.realCloudValidated!==false||
     !Array.isArray(t)||t.length!==7||
     t.some((x,i)=>x.runId!==r.runId||x.sequence!==i+1||x.id!==r.checks?.[i]?.id||
       x.pass!==r.checks[i].pass))
    throw Error("M1_IMPORT_NOT_SAME_RUN_OR_UNSAFE");
  output.textContent=JSON.stringify({
   source:"IMPORTED LOCAL FILES, SHA256 NOT VERIFIED IN BROWSER",
   runId:r.runId,commit:r.commit,status:r.status,ok:r.ok,
   stages:t.map(x=>({id:x.id,pass:x.pass,detail:x.data||x.error})),
   limits:r.limits
  },null,2);
 }catch(e){m1Import[which]=null;output.textContent="M1 rechazado: "+String(e.message||e);}
}
function bind(){
  $("mode-sim").addEventListener("click",()=>dispatch({command:"mode",mode:"sim"}));
  $("mode-lab").addEventListener("click",()=>dispatch({command:"mode",mode:"lab"}));
  $("open-arm64-lab").addEventListener("click",async()=>{
    if(busy)return;
    await dispatch({command:"mode",mode:"lab"});
    if(currentMode==="lab")$("arm64-lab-panel").scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("lab-sample").addEventListener("click",()=>labAction("sample"));
  $("lab-restart").addEventListener("click",()=>labAction("restart"));
  $("lab-compact").addEventListener("click",()=>labAction("compact"));
  $("lab-lost-ack").addEventListener("click",()=>labAction("lostAck"));
  $("lab-forged-ack").addEventListener("click",()=>labAction("forgedAck"));
  $("lab-timeout").addEventListener("click",()=>labAction("timeout"));
  $("lab-missing-proof").addEventListener("click",()=>labAction("missingProof"));
  $("lab-bad-version").addEventListener("click",()=>labAction("badVersion"));
  $("lab-retry-sync").addEventListener("click",()=>labAction("syncRetry"));
  $("lab-loopback").addEventListener("click",()=>labAction("loopback"));
  $("lab-reset").addEventListener("click",()=>labAction("reset",{profile:$("lab-profile").value}));
  $("receive-package").addEventListener("click",submitReceipt);
  $("edge-autonomous-smoke").addEventListener("click",()=>labAction("autonomousSmoke"));
  $("m3-lifecycle-smoke").addEventListener("click",()=>labAction("m3Lifecycle"));
  $("m3-recovery-smoke").addEventListener("click",()=>labAction("m3Recovery"));
  $("m3-operations-smoke").addEventListener("click",()=>labAction("m3Operations"));
  $("m4-property-smoke").addEventListener("click",()=>labAction("propertySmoke"));
  $("m4-host-smoke").addEventListener("click",()=>labAction("hostSmoke"));
  $("m4-commonality-run").addEventListener("click",()=>labAction("m4Commonality"));
  $("m4-integrated-run").addEventListener("click",()=>labAction("m4Integrated"));
  $("m5-install-run").addEventListener("click",()=>labAction("m5InstallLab"));
  $("m54-systemd-run").addEventListener("click",()=>labAction("m54Systemd"));
  $("m55-isolation-run").addEventListener("click",()=>labAction("m55Isolation"));
  $("m56-integration-run").addEventListener("click",()=>labAction("m56Integration"));
  $("predevice-conformance").addEventListener("click",()=>labAction("predeviceConformance"));
  $("golden-traces").addEventListener("click",()=>labAction("goldenTraces"));
  $("device-preflight").addEventListener("click",()=>labAction("devicePreflight"));
  $("hardware-screening").addEventListener("click",()=>labAction("hardwareScreening"));
  $("arm64-comparison-file").addEventListener("change",e=>importArm64Comparison(e.target.files?.[0]));
  $("arm64-e5-file").addEventListener("change",e=>importArm64E5(e.target.files?.[0]));
  $("arm64-f1-file").addEventListener("change",e=>importArm64F1(e.target.files?.[0]));
  $("arm64-f2-file").addEventListener("change",e=>importArm64F2(e.target.files?.[0]));
  $("m1-report-file").addEventListener("change",e=>importM1Evidence("report",e.target.files?.[0]));
  $("m1-trace-file").addEventListener("change",e=>importM1Evidence("trace",e.target.files?.[0]));
  $("workload-start").addEventListener("click",()=>labAction("workloadStart"));
  $("workload-stop").addEventListener("click",()=>labAction("workloadStop"));
  $("workload-crash").addEventListener("click",()=>labAction("workloadCrash"));
  $("workload-reconcile").addEventListener("click",()=>labAction("workloadReconcile"));
  $("workload-receipt").addEventListener("click",()=>labAction("workloadReceipt",{
    receiptId:$("receipt-id").value.trim(),packageId:$("package-id").value.trim()}));
  $("load").addEventListener("click",()=>dispatch({command:"load",scenario:$("scenario-select").value}));
  $("next").addEventListener("click",()=>dispatch({command:"next"}));
  $("run").addEventListener("click",()=>dispatch({command:"run"}));
  $("back").addEventListener("click",()=>dispatch({command:"rewind",cursor:Math.max(0,current.cursor-1)}));
  $("reset").addEventListener("click",()=>dispatch({command:"reset"}));
  for(const id of ["primary","backup"]){
    $("toggle-"+id).addEventListener("click",()=>{
      const w=current.state.wans.find(x=>x.id===id);
      if(currentMode==="lab"){
        const lw=currentLab.wans.find(x=>x.id===id);
        labAction("wan",{id,upstream:!(lw.link&&lw.upstream)});
      }else inject({action:"set_wan",id,link:true,upstream:!(w.link&&w.upstream)});
    });
  }
  $("toggle-cloud").addEventListener("click",()=>currentMode==="lab"?
    labAction("cloud",{available:!currentLab.cloud.available}):
    inject({action:"set_cloud",available:!current.state.cloudAvailable}));
  $("tick").addEventListener("click",()=>currentMode==="lab"?labAction("sample"):
    inject({action:"tick",seconds:1}));
  $("append-event").addEventListener("click",()=>inject({action:"append",eventId:"ui-"+(++eventSeq)+"-"+Date.now(),payload:{origin:"dashboard",clock:current.state.clock},category:"O1"}));
  $("sync-cloud").addEventListener("click",()=>currentMode==="lab"?labAction("sync"):
    inject({action:"sync"}));
  $("power-cut").addEventListener("click",()=>inject({action:"power_cut"}));
  $("rollback-config").addEventListener("click",()=>inject({action:"apply_config",revision:"proposed-"+(++eventSeq),healthPass:false,
    expect:{ok:false,error:"HEALTH_CHECK_FAILED"}}));
}
async function start(){
  try{
    const res=await fetch("/api/bootstrap",{cache:"no-store"});
    if(!res.ok)throw Error("No se pudo iniciar el panel");
    const data=await res.json();
    token=data.token;
    for(const id of data.scenarios){const option=document.createElement("option");option.value=id;option.textContent=id;$("scenario-select").append(option);}
    bind();render(data.session,data.lab,data.mode);
    setText("connection","● ONLINE / LOCAL");
    message("Listo. Puedes inyectar eventos o cargar un escenario.");
  }catch(err){setText("connection","● OFFLINE");message(String(err.message||err),true);}
}
start();
setInterval(async()=>{
  if(!token||busy||currentMode!=="lab")return;
  try{
    const response=await fetch("/api/state",{cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json();
    if(!busy&&currentMode==="lab")render(data.session,data.lab,data.mode);
  }catch{ /* browser/daemon may be disconnected; command path reports errors */ }
},1200);
