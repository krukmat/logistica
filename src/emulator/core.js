"use strict";
// Pure logical-time simulator; no OS network, real fsync, power or hardware measurements.
const createSimulator=function createSimulator(options={}){
  const defaults={profile:"BASE",p1CapacityBytes:65536,p2CapacityBytes:131072,workloadMemoryBudgetMiB:512,workloadCpuBudgetMillicores:1000,failbackHoldSeconds:5};
  const c=Object.assign({},defaults,options);
  for(const k of ["p1CapacityBytes","p2CapacityBytes","workloadMemoryBudgetMiB","workloadCpuBudgetMillicores"]){if(!Number.isSafeInteger(c[k])||c[k]<0)throw Error("BAD_CONFIG:"+k);}
  if(!Number.isFinite(c.failbackHoldSeconds)||c.failbackHoldSeconds<0)throw Error("BAD_CONFIG:failbackHoldSeconds");
  const inputWans=c.wans||[{id:"primary",priority:1,link:true,upstream:true},{id:"backup",priority:2,link:true,upstream:true}];
  if(!Array.isArray(inputWans)||!inputWans.length||new Set(inputWans.map(w=>w.id)).size!==inputWans.length)throw Error("BAD_CONFIG:wans");
  const state={clock:0,profile:c.profile,wans:inputWans.map(w=>({id:w.id,priority:w.priority,link:w.link!==false,upstream:w.upstream!==false,healthySince:null})),selectedWan:null,connectivity:"LOCAL_ONLY",cloudAvailable:true,cloudStatus:"CLOUD_DISCONNECTED",remoteTrusted:true,security:"SECURE",health:"BOOTING",knownGoodRevision:"r0",configRevision:"r0",journal:[],p1Used:0,prepared:[],nextEvent:1,p2Used:0,p2Reserved:0,workloads:{},cloudEvents:[],cloudDuplicates:0,trace:[],seq:0};
  const bytesOf=(s)=>{let n=0;for(const cp of String(s)){const u=cp.codePointAt(0);n+=u<128?1:u<2048?2:u<65536?3:4;}return n;};
  const copy=x=>JSON.parse(JSON.stringify(x));
  const record=(kind,details={})=>{const e={seq:++state.seq,t:state.clock,kind,...details};state.trace.push(e);return e;};
  const usable=w=>w.link&&w.upstream;
  const status=()=>({clock:state.clock,profile:state.profile,selectedWan:state.selectedWan,connectivity:state.connectivity,cloud:state.cloudStatus,security:state.security,health:state.health,configRevision:state.configRevision,knownGoodRevision:state.knownGoodRevision,p1Used:state.p1Used,p1CapacityBytes:c.p1CapacityBytes,p2Used:state.p2Used,p2Reserved:state.p2Reserved,p2CapacityBytes:c.p2CapacityBytes,pendingEvents:state.journal.length,cloudEvents:state.cloudEvents.length,cloudDuplicates:state.cloudDuplicates,workloads:Object.fromEntries(Object.entries(state.workloads).map(([k,w])=>[k,{status:w.status,memoryRequestMiB:w.resources.memory_request_mib,cpuRequestMillicores:w.resources.cpu_request_millicores,storageUsed:w.storageUsed,attempts:w.attempts}]))});
  const refresh=()=>{
    const available=state.wans.filter(usable).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
    for(const w of state.wans){if(usable(w)){if(w.healthySince===null)w.healthySince=state.clock;}else w.healthySince=null;}
    const current=state.wans.find(w=>w.id===state.selectedWan),best=available[0];
    let next=state.selectedWan;
    if(!current||!usable(current))next=best?best.id:null;
    else if(best&&best.priority<current.priority&&state.clock-best.healthySince>=c.failbackHoldSeconds)next=best.id;
    if(next!==state.selectedWan){record("WAN_SELECTED",{from:state.selectedWan,to:next});state.selectedWan=next;}
    state.connectivity=available.length===0?"LOCAL_ONLY":available.length>=2?"MULTI_WAN_HEALTHY":"CONNECTED";
    state.cloudStatus=state.cloudAvailable&&available.length>0&&state.remoteTrusted?"ONLINE":"CLOUD_DISCONNECTED";
    state.security=state.remoteTrusted?"SECURE":"REMOTE_ISOLATED";
    if(state.health==="BOOTING")state.health="HEALTHY";
    return status();
  };
  const append=(p={})=>{
    const id=p.eventId||"evt-"+state.nextEvent;
    if(state.journal.some(e=>e.id===id)||state.cloudEvents.includes(id))return {ok:true,ack:true,eventId:id,duplicate:true};
    const payload=p.payload===undefined?{}:p.payload;
    const bytes=bytesOf(JSON.stringify({id,payload,category:p.category||"O1"}));
    if(bytes>c.p1CapacityBytes-state.p1Used){record("APPEND_REJECTED",{id,bytes,reason:"STORAGE_FULL_OR_UNSAFE"});return {ok:false,ack:false,error:"STORAGE_FULL_OR_UNSAFE",eventId:id};}
    state.journal.push({id,payload:copy(payload),bytes,category:p.category||"O1",committedAt:state.clock});
    state.p1Used+=bytes;state.nextEvent++;record("APPEND_COMMITTED",{id,bytes});
    return {ok:true,ack:true,eventId:id,bytes,simulatedDurable:true};
  };
  const admit=(p={})=>{
    const m=p.manifest;
    if(!m||typeof m!=="object"||typeof m.workload_id!=="string"||!m.workload_id||!m.resources)return {ok:false,error:"INVALID_MANIFEST"};
    if(p.trusted===false)return {ok:false,error:"UNTRUSTED_WORKLOAD"};
    if(state.workloads[m.workload_id])return {ok:false,error:"ALREADY_ADMITTED"};
    if(m.compatibility!=="pef-core-v0.1"||!["LOCAL_ONLY_CAPABLE","INTERNET_OPTIONAL","INTERNET_REQUIRED"].includes(m.connectivity_mode))return {ok:false,error:"INVALID_MANIFEST"};
    const r=m.resources;
    for(const [a,b] of [["cpu_request_millicores","cpu_limit_millicores"],["memory_request_mib","memory_limit_mib"],["storage_request_mib","storage_limit_mib"]]){
      if(!Number.isSafeInteger(r[a])||r[a]<1||!Number.isSafeInteger(r[b])||r[b]<r[a])return {ok:false,error:"INVALID_MANIFEST"};
    }
    if(!["P2","P3"].includes(r.storage_class))return {ok:false,error:"INVALID_MANIFEST"};
    const allowed=["local_service_discovery","egress","isolated_network","local_service_publish"];
    if(!Array.isArray(m.network_intents)||m.network_intents.some(x=>!x||!allowed.includes(x.kind)||x.raw_command||x.host_network))return {ok:false,error:"NETWORK_INTENT_DENIED"};
    const existing=Object.values(state.workloads);
    if(existing.reduce((n,w)=>n+w.resources.memory_request_mib,0)+r.memory_request_mib>c.workloadMemoryBudgetMiB)return {ok:false,error:"INSUFFICIENT_MEMORY"};
    if(existing.reduce((n,w)=>n+w.resources.cpu_request_millicores,0)+r.cpu_request_millicores>c.workloadCpuBudgetMillicores)return {ok:false,error:"INSUFFICIENT_CPU"};
    if(state.p2Reserved+r.storage_request_mib*1048576>c.p2CapacityBytes)return {ok:false,error:"INSUFFICIENT_P2_STORAGE"};
    const h=m.health?.restart_policy||{max_attempts:3,window_seconds:300,backoff_seconds:1};
    if(!Number.isInteger(h.max_attempts)||h.max_attempts<0||!Number.isInteger(h.window_seconds)||h.window_seconds<1)return {ok:false,error:"INVALID_MANIFEST"};
    state.workloads[m.workload_id]={resources:copy(r),connectivity_mode:m.connectivity_mode,priority:m.priority||"optional",status:"RUNNING",storageUsed:0,attempts:0,windowStart:state.clock,restartPolicy:copy(h)};
    state.p2Reserved+=r.storage_request_mib*1048576;record("WORKLOAD_ADMITTED",{id:m.workload_id});return {ok:true,id:m.workload_id,status:"RUNNING"};
  };
  const act=(action,p={})=>{
    let w;
    switch(action){
      case "tick": {const seconds=p.seconds??1;if(!Number.isFinite(seconds)||seconds<0)throw Error("BAD_TICK");state.clock+=seconds;return {ok:true,...refresh()};}
      case "set_wan":{w=state.wans.find(x=>x.id===p.id);if(!w)return {ok:false,error:"WAN_NOT_FOUND"};if("link" in p)w.link=Boolean(p.link);if("upstream" in p)w.upstream=Boolean(p.upstream);record("WAN_FAULT",{id:w.id,link:w.link,upstream:w.upstream});return {ok:true};}
      case "set_cloud":state.cloudAvailable=Boolean(p.available);record("CLOUD_FAULT",{available:state.cloudAvailable});refresh();return {ok:true};
      case "set_remote_trust":state.remoteTrusted=Boolean(p.trusted);record("REMOTE_TRUST",{trusted:state.remoteTrusted});refresh();return {ok:true};
      case "append":return append(p);
      case "prepare_append":state.prepared.push(copy(p));record("UNACKED_PREPARE",{eventId:p.eventId||null});return {ok:true,ack:false};
      case "sync":{
        if(state.cloudStatus!=="ONLINE")return {ok:false,error:"CLOUD_UNAVAILABLE"};
        let uploaded=0,duplicates=0;
        for(const e of state.journal){if(state.cloudEvents.includes(e.id)){duplicates++;state.cloudDuplicates++;}else{state.cloudEvents.push(e.id);uploaded++;}}
        if(!p.dropLocalAck){state.journal=[];state.p1Used=0;}
        record("SYNC",{uploaded,duplicates,localAckPersisted:!p.dropLocalAck});return {ok:true,uploaded,duplicates,localAckPersisted:!p.dropLocalAck};
      }
      case "admit":return admit(p);
      case "write_workload":{
        w=state.workloads[p.id];if(!w)return {ok:false,error:"WORKLOAD_NOT_FOUND"};
        const bytes=p.bytes;if(!Number.isSafeInteger(bytes)||bytes<0)return {ok:false,error:"BAD_SIZE"};
        if(w.storageUsed+bytes>w.resources.storage_limit_mib*1048576||state.p2Used+bytes>c.p2CapacityBytes)return {ok:false,error:"P2_QUOTA_EXCEEDED"};
        w.storageUsed+=bytes;state.p2Used+=bytes;record("WORKLOAD_STORAGE_WRITE",{id:p.id,bytes});return {ok:true};
      }
      case "crash_workload":{
        w=state.workloads[p.id];if(!w)return {ok:false,error:"WORKLOAD_NOT_FOUND"};
        if(state.clock-w.windowStart>w.restartPolicy.window_seconds){w.windowStart=state.clock;w.attempts=0;}
        w.attempts++;w.status=w.attempts>w.restartPolicy.max_attempts?"ISOLATED":"RUNNING";
        record("WORKLOAD_CRASH",{id:p.id,attempt:w.attempts,result:w.status});return {ok:true,status:w.status,attempts:w.attempts};
      }
      case "apply_config":{
        if(typeof p.revision!=="string"||!p.revision)return {ok:false,error:"INVALID_REVISION"};
        const previous=state.configRevision;
        if(p.healthPass===false){record("CONFIG_ROLLBACK",{from:p.revision,to:previous});return {ok:false,error:"HEALTH_CHECK_FAILED",effectiveRevision:previous};}
        state.configRevision=p.revision;state.knownGoodRevision=p.revision;record("CONFIG_COMMITTED",{revision:p.revision});return {ok:true,revision:p.revision};
      }
      case "power_cut":{
        const lost=state.prepared.length;state.prepared=[];
        record("SIMULATED_POWER_CUT",{discardedUnacked:lost,committedRetained:state.journal.length});
        state.health="BOOTING";refresh();return {ok:true,simulatedOnly:true,discardedUnacked:lost,committedRetained:state.journal.length};
      }
      case "status":return status();
      default:return {ok:false,error:"UNKNOWN_ACTION",action};
    }
  };
  refresh();
  return {act,status,trace:()=>copy(state.trace),snapshot:()=>copy({state,config:c}),getCommitted:()=>copy(state.journal),getCloud:()=>copy(state.cloudEvents)};
};
module.exports={createSimulator};
