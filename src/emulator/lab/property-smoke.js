"use strict";
// Real localhost Edge + supervised Property worker; synthetic WAN and Cloud mock only.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {createAutonomousEdgeHost}=require("../../runtime/autonomous-edge.js");
async function runPropertySmoke(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-property-smoke-"));
  const token=randomBytes(32).toString("hex");
  const config={schemaVersion:1,backend:"virtual-lab",
    identity:{siteId:"property-site",deviceId:"property-edge",configRevision:"r1"},
    storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:300,
    workload:{enabled:true,profile:"property",reconcileMs:250},
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
  const alert={operation:"ALERT",incidentId:"INC-001",assetId:"PUMP-01",severity:"CRITICAL"};
  const ack={operation:"ACK",incidentId:"INC-001"};
  try{
    first=createAutonomousEdgeHost({config,token});
    const url=await first.listen();
    const initial=await request(url,"state");
    checks.OFFLINE_BOOT=initial.network.connectivity==="LOCAL_ONLY"&&
      initial.activeOverlay==="property"&&initial.workloads.some(w=>w.workloadId==="pef-property"&&
        w.state==="RUNNING"&&w.actualLimitsEnforced===false);
    checks.AUTH_REQUIRED=(await fetch(url+"property/incidents")).status===403;
    checks.ORPHAN_ACK_REJECTED=(await request(url,"property/incidents",ack)).http===400;
    checks.INVALID_INPUT_REJECTED=(await request(url,"property/incidents",
      {...alert,severity:"UNSAFE"})).http===400;
    const raised=await request(url,"property/incidents",alert);
    checks.ALERT_FSYNC=raised.http===201&&raised.fsyncCompleted===true&&raised.accepted===true;
    checks.IDEMPOTENT_ALERT=(await request(url,"property/incidents",alert)).duplicate===true;
    checks.CONFLICT_REJECTED=(await request(url,"property/incidents",
      {...alert,assetId:"PUMP-02"})).http===409;
    const acknowledged=await request(url,"property/incidents",ack);
    checks.ACK_FSYNC=acknowledged.http===201&&acknowledged.fsyncCompleted===true;
    checks.OFFLINE_SYNC_BLOCKED=(await request(url,"lab/sync",{})).http===409;
    const before=await request(url,"state");
    checks.OFFLINE_WORKFLOW=before.propertyIncidents.length===1&&
      before.propertyIncidents[0].status==="ACKNOWLEDGED"&&
      before.propertyIncidents[0].cloudAcked===false&&before.storage.pending>=3;
    await first.close();first=null;
    second=createAutonomousEdgeHost({config,token});
    const restoredUrl=await second.listen();
    const restored=await request(restoredUrl,"state");
    checks.RESTART_RESTORES_INCIDENT=restored.identity.sessionId!==before.identity.sessionId&&
      restored.propertyIncidents.length===1&&restored.propertyIncidents[0].status==="ACKNOWLEDGED"&&
      restored.propertyIncidents[0].alertEventId==="property.property-edge.INC-001.alert"&&
      restored.propertyIncidents[0].ackEventId==="property.property-edge.INC-001.ack";
    checks.IDEMPOTENT_ACK=(await request(restoredUrl,"property/incidents",ack)).duplicate===true;
    await request(restoredUrl,"lab/wan",{id:"primary",upstream:true});
    await request(restoredUrl,"lab/sample",{});
    const sync=await request(restoredUrl,"lab/sync",{});
    const online=await request(restoredUrl,"state");
    checks.MOCK_REPLAY=sync.http===200&&sync.result.status==="SYNC_OK"&&
      online.propertyIncidents[0].cloudAcked===true&&
      online.propertyIncidents[0].ackCloudAcked===true&&online.storage.pending===0;
    const ok=Object.values(checks).every(Boolean);
    return {kind:"PEF_M4_PROPERTY_SMOKE_V1",ok,status:ok?"LAB_PASS":"LAB_FAIL",
      checks,incident:online.propertyIncidents[0],
      eventsBeforeReplay:before.storage.pending,eventsAfterReplay:online.storage.pending,
      standaloneWithoutDashboard:true,worker:"pef-property",workloadIsolation:"NODE_PROCESS_ONLY",
      actualLimitsEnforced:false,cloudMockOnly:true,physicalValidated:false,
      powerCutValidated:false,realCloudProvisioned:false};
  }finally{
    if(first)await first.close();
    if(second)await second.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
module.exports={runPropertySmoke};
