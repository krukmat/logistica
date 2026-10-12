"use strict";
// Instrumented standalone Edge service smoke for the dashboard. Real HTTP + OS fsync;
// no physical WAN, Cloud or security attestation. Independent from dashboard session.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {createAutonomousEdgeHost}=require("../../runtime/autonomous-edge.js");
async function runStandaloneEdgeSmoke(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-standalone-smoke-"));
  const token=randomBytes(32).toString("hex");
  const config={schemaVersion:1,backend:"virtual-lab",
    identity:{siteId:"smoke-site",deviceId:"standalone-smoke",configRevision:"r1"},
    storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:250,
    workload:{enabled:true,reconcileMs:250},
    journal:{capacityBytes:65536,controlReserveBytes:4096},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
  const request=async(url,route,body)=>{
    const r=await fetch(url+route,{method:body?"POST":"GET",headers:{
      "x-pef-token":token,...(body?{"content-type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {http:r.status,...await r.json()};
  };
  let first=null,second=null;
  try{
    first=createAutonomousEdgeHost({config,token});
    const url=await first.listen();
    const before=await request(url,"state");
    const receipt=await request(url,"workloads/receipts",{receiptId:"SMOKE-1",packageId:"BOX-1"});
    if(before.network.connectivity!=="LOCAL_ONLY"||
       receipt.http!==201||receipt.fsyncCompleted!==true)
      throw Error("STANDALONE_SERVICE_OFFLINE_FAILED");
    const sessionBefore=before.identity.sessionId;
    await first.close();first=null;
    second=createAutonomousEdgeHost({config,token});
    const restored=await second.listen(),after=await request(restored,"state");
    if(sessionBefore===after.identity.sessionId||
       after.receipts.length!==1||after.receipts[0].receiptId!=="SMOKE-1")
      throw Error("STANDALONE_SERVICE_RECOVERY_FAILED");
    return {ok:true,status:"LAB_PASS",backend:"virtual-lab",httpValidated:true,
      standaloneWithoutDashboard:true,offlineAccepted:true,fsyncCompleted:true,
      retainedAfterRestart:true,rotatedSession:true,
      workloadSupervised:true,physicalValidated:false,
      powerCutValidated:false,remoteCloudProvisioned:false};
  }finally{
    if(first)await first.close();
    if(second)await second.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
module.exports={runStandaloneEdgeSmoke};
