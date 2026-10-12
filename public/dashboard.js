"use strict";
const $=id=>document.getElementById(id);
let token=null,current=null,busy=false,eventSeq=0;
function labelState(node,state){
  node.querySelector(".region-value").textContent=String(state.state||"—");
  node.classList.toggle("active",["HEALTHY","MULTI_WAN_HEALTHY","CONNECTED","ONLINE","READY","RUNNING","SECURE","IDLE"].includes(state.state));
  node.classList.toggle("warn",["LOCAL_ONLY","CLOUD_DISCONNECTED","PRESSURE","ISOLATED"].includes(state.state));
  node.classList.toggle("bad",["CRITICAL","FULL","REMOTE_ISOLATED"].includes(state.state));
}
function setText(id,value){$(id).textContent=String(value);}
function render(session){
  current=session;
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
  setText("cloud-descr",st.cloud==="ONLINE"?"Cloud virtual conectado":"Cloud virtual desconectado");
  setText("toggle-cloud",st.cloud==="ONLINE"?"Desconectar":"Restaurar");
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
  if(session.halted)message("Escenario detenido: assertion o acción fallida. Retrocede o reinicia.",true);
}
function message(text,failed=false){$("feedback").textContent=text;$("feedback").classList.toggle("failed",failed);}
async function dispatch(command){
  if(busy||!token)return;
  busy=true;
  try{
    const res=await fetch("/api/command",{method:"POST",headers:{"content-type":"application/json","x-pef-session":token},body:JSON.stringify(command)});
    const data=await res.json();
    if(!res.ok||!data.ok)throw Error(data.error||"Command failed");
    render(data.session);
    if(data.result&&data.result.ok===false)message("Evento: "+(data.result.error||"rechazado"),true);
    else if(command.command==="load")message("Escenario cargado. Usa Paso siguiente o Ejecutar todo.");
    else message(command.command==="enqueue"?"Evento inyectado en el simulador.":"Estado actualizado.");
  }catch(err){message(String(err.message||err),true);}
  finally{busy=false;if(current)render(current);}
}
function inject(step){return dispatch({command:"enqueue",step});}
function bind(){
  $("load").addEventListener("click",()=>dispatch({command:"load",scenario:$("scenario-select").value}));
  $("next").addEventListener("click",()=>dispatch({command:"next"}));
  $("run").addEventListener("click",()=>dispatch({command:"run"}));
  $("back").addEventListener("click",()=>dispatch({command:"rewind",cursor:Math.max(0,current.cursor-1)}));
  $("reset").addEventListener("click",()=>dispatch({command:"reset"}));
  for(const id of ["primary","backup"]){
    $("toggle-"+id).addEventListener("click",()=>{
      const w=current.state.wans.find(x=>x.id===id);
      inject({action:"set_wan",id,upstream:!(w.link&&w.upstream)});
    });
  }
  $("toggle-cloud").addEventListener("click",()=>inject({action:"set_cloud",available:current.state.cloud!=="ONLINE"}));
  $("tick").addEventListener("click",()=>inject({action:"tick",seconds:1}));
  $("append-event").addEventListener("click",()=>inject({action:"append",eventId:"ui-"+(++eventSeq)+"-"+Date.now(),payload:{origin:"dashboard",clock:current.state.clock},category:"O1"}));
  $("sync-cloud").addEventListener("click",()=>inject({action:"sync"}));
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
    bind();render(data.session);
    setText("connection","● ONLINE / LOCAL");
    message("Listo. Puedes inyectar eventos o cargar un escenario.");
  }catch(err){setText("connection","● OFFLINE");message(String(err.message||err),true);}
}
start();
