"use strict";
// M4.2 Host: real standalone Edge HTTP + allowlisted IPC worker + shared fsync journal.
// WAN links / Cloud remote service are synthetic laboratory adapters.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {createAutonomousEdgeHost}=require("../../runtime/autonomous-edge.js");
async function runHostSmoke(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-host-smoke-"));
  const token=randomBytes(32).toString("hex");
  const config={schemaVersion:1,backend:"virtual-lab",
    identity:{siteId:"host-site",deviceId:"host-edge",configRevision:"r1"},
    storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:300,
    workload:{enabled:true,profile:"host",reconcileMs:250},
    journal:{capacityBytes:65536,controlReserveBytes:4096},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
  const request=async(url,route,body)=>{
    const r=await fetch(url+route,{method:body?"POST":"GET",headers:{
      "x-pef-token":token,...(body?{"content-type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {http:r.status,...await r.json()};
  };
  let first=null,second=null;
  const checks={};
  const incident={operation:"OPEN",incidentId:"HOST-001",unitId:"CABIN-07",
    category:"MAINTENANCE",severity:"WARNING"};
  const ack={operation:"ACK",incidentId:"HOST-001"};
  try{
    first=createAutonomousEdgeHost({config,token});
    const url=await first.listen();
    const initial=await request(url,"state");
    checks.OFFLINE_BOOT=initial.network.connectivity==="LOCAL_ONLY"&&
      initial.activeOverlay==="host"&&initial.workloads.some(w=>w.workloadId==="pef-host"&&
        w.state==="RUNNING"&&w.actualLimitsEnforced===false);
    checks.AUTH_REQUIRED=(await fetch(url+"host/incidents")).status===403;
    checks.ORPHAN_ACK_REJECTED=(await request(url,"host/incidents",ack)).http===400;
    checks.INVALID_CATEGORY_REJECTED=(await request(url,"host/incidents",
      {...incident,category:"ARBITRARY"})).http===400;
    checks.EXTRA_FIELD_REJECTED=(await request(url,"host/incidents",
      {...incident,remoteCommand:"shell"})).http===400;
    const created=await request(url,"host/incidents",incident);
    checks.OPEN_FSYNC=created.http===201&&created.fsyncCompleted===true&&created.accepted===true;
    checks.IDEMPOTENT_OPEN=(await request(url,"host/incidents",incident)).http===200;
    checks.CONFLICT_REJECTED=(await request(url,"host/incidents",
      {...incident,unitId:"CABIN-08"})).http===409;
    const acknowledged=await request(url,"host/incidents",ack);
    checks.ACK_FSYNC=acknowledged.http===201&&acknowledged.fsyncCompleted===true;
    checks.OFFLINE_SYNC_BLOCKED=(await request(url,"lab/sync",{})).http===409;
    const before=await request(url,"state");
    checks.OFFLINE_WORKFLOW=before.hostIncidents.length===1&&
      before.hostIncidents[0].unitId==="CABIN-07"&&
      before.hostIncidents[0].category==="MAINTENANCE"&&
      before.hostIncidents[0].status==="ACKNOWLEDGED"&&
      before.propertyIncidents.length===0&&
      before.hostIncidents[0].cloudAcked===false&&before.storage.pending>=3;
    await first.close();first=null;
    second=createAutonomousEdgeHost({config,token});
    const restoredUrl=await second.listen();
    const restored=await request(restoredUrl,"state");
    checks.RESTART_RESTORES_INCIDENT=restored.identity.sessionId!==before.identity.sessionId&&
      restored.hostIncidents.length===1&&restored.hostIncidents[0].status==="ACKNOWLEDGED"&&
      restored.hostIncidents[0].alertEventId==="host.host-edge.HOST-001.open"&&
      restored.hostIncidents[0].ackEventId==="host.host-edge.HOST-001.ack";
    checks.IDEMPOTENT_ACK=(await request(restoredUrl,"host/incidents",ack)).http===200;
    await request(restoredUrl,"lab/wan",{id:"primary",upstream:true});
    await request(restoredUrl,"lab/sample",{});
    const sync=await request(restoredUrl,"lab/sync",{});
    const online=await request(restoredUrl,"state");
    checks.MOCK_REPLAY=sync.http===200&&sync.result.status==="SYNC_OK"&&
      online.hostIncidents[0].cloudAcked===true&&
      online.hostIncidents[0].ackCloudAcked===true&&online.storage.pending===0;
    const ok=Object.values(checks).every(Boolean);
    return {kind:"PEF_M4_HOST_SMOKE_V1",ok,status:ok?"LAB_PASS":"LAB_FAIL",
      checks,incident:online.hostIncidents[0],
      eventsBeforeReplay:before.storage.pending,eventsAfterReplay:online.storage.pending,
      standaloneWithoutDashboard:true,worker:"pef-host",sharedEngine:"src/core/site-operations.js",
      workloadIsolation:"NODE_PROCESS_ONLY",actualLimitsEnforced:false,
      cloudMockOnly:true,physicalValidated:false,powerCutValidated:false,
      realCloudProvisioned:false};
  }finally{
    if(first)await first.close();
    if(second)await second.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
module.exports={runHostSmoke};
