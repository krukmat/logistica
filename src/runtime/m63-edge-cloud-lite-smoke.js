"use strict";
// M6.3 real Edge host + real Cloud Lite loopback HTTP. Local WAN model; no remote TLS.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {randomBytes}=require("node:crypto");
const {createCloudLiteRegistryServer}=require("./cloud-lite-registry-server.js");
const {createCloudLiteHttpTransport}=require("../adapters/cloud-lite-http-transport.js");
const {createAutonomousEdgeHost}=require("./autonomous-edge.js");
async function runM63EdgeSyncSmoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m63-reconcile-"));
 const cloudDir=path.join(root,"cloud");
 fs.mkdirSync(cloudDir,{mode:0o700});
 const admin=randomBytes(32).toString("hex");
 let cloud=createCloudLiteRegistryServer({dir:cloudDir,adminToken:admin,enableIngest:true});
 const checks={},observed=[];let activeEdge=null;
 const req=async(url,route,body,token)=>{
   const response=await fetch(url+route,{method:body?"POST":"GET",headers:{
     ...(body?{"content-type":"application/json"}:{}),
     ...(token?{"x-pef-token":token}:{})},
     ...(body?{body:JSON.stringify(body)}:{})});
   return {http:response.status,...await response.json()};
 };
 const adminStatus=async url=>await fetch(url+"/v1/admin/status",{
   headers:{"x-pef-admin-token":admin}}).then(x=>x.json());
 try{
   const cloudUrl=await cloud.listen();
   checks.EDGE_TRANSPORT_REJECTS_EXTERNAL=false;
   try{createCloudLiteHttpTransport({baseUrl:"https://cloud.example",deviceToken:"a".repeat(64)});}
   catch(e){checks.EDGE_TRANSPORT_REJECTS_EXTERNAL=/CLOUD_LITE_/.test(e.message);}
   for(const profile of ["property","host"]){
     const deviceId="m63-"+profile,identity={siteId:"m63-site",deviceId,configRevision:"r1"};
     const response=await fetch(cloudUrl+"/v1/admin/enroll",{method:"POST",headers:{
       "content-type":"application/json","x-pef-admin-token":admin},body:JSON.stringify(identity)});
     const enrolled=await response.json(),deviceToken=enrolled.deviceToken;
     checks[profile+"_REGISTRY_ENROLLED"]=response.status===201&&enrolled.fsyncCompleted===true;
     const transport=createCloudLiteHttpTransport({baseUrl:cloudUrl,deviceToken});
     let dropAck=false,remoteAckAfterCommit=false;
     const bridge={ingest:async event=>{
       const ack=await transport.ingest(event);
       if(dropAck&&ack.ok){
         dropAck=false;remoteAckAfterCommit=true;
         throw Error("M63_LAB_ACK_LOST_AFTER_REMOTE_FSYNC");
       }
       return ack;
     },verifyAck:transport.verifyAck};
     const dataDir=path.join(root,"edge-"+profile);
     fs.mkdirSync(dataDir,{mode:0o700});
     const config={schemaVersion:1,backend:"virtual-lab",identity,storageDir:dataDir,
       http:{host:"127.0.0.1",port:0},sampleIntervalMs:250,
       workload:{enabled:true,profile,reconcileMs:200},
       journal:{capacityBytes:131072,controlReserveBytes:8192},
       wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
     const edgeToken=randomBytes(32).toString("hex");
     activeEdge=createAutonomousEdgeHost({config,token:edgeToken,cloudTransport:bridge});
     let edgeUrl=await activeEdge.listen();
     let state=await req(edgeUrl,"state",null,edgeToken);
     checks[profile+"_OFFLINE_BOOT"]=state.network.connectivity==="LOCAL_ONLY"&&
       state.workloads.some(x=>x.workloadId==="pef-"+profile&&x.state==="RUNNING")&&
       state.cloudLite.configured===true;
     const first=profile==="property"?{
       operation:"ALERT",incidentId:"M63-1",assetId:"PUMP-01",severity:"WARNING"
     }:{operation:"OPEN",incidentId:"M63-1",unitId:"CABIN-07",category:"MAINTENANCE",severity:"WARNING"};
     const created=await req(edgeUrl,profile+"/incidents",first,edgeToken);
     const acknowledged=await req(edgeUrl,profile+"/incidents",{
       operation:"ACK",incidentId:"M63-1"},edgeToken);
     checks[profile+"_LOCAL_FSYNC"]=created.http===201&&created.fsyncCompleted===true&&
       acknowledged.http===201&&acknowledged.fsyncCompleted===true;
     const unavailable=await req(edgeUrl,"lab/cloud-lite/sync",{},edgeToken);
     checks[profile+"_OFFLINE_SYNC_REFUSED"]=unavailable.http===409&&
       unavailable.error==="CLOUD_UNAVAILABLE";
     await req(edgeUrl,"lab/wan",{id:"primary",link:true,upstream:true},edgeToken);
     await req(edgeUrl,"lab/sample",{},edgeToken);
     const synced=await req(edgeUrl,"lab/cloud-lite/sync",{},edgeToken);
     state=await req(edgeUrl,"state",null,edgeToken);
     checks[profile+"_REAL_CLOUD_SYNC"]=synced.http===200&&
       synced.result?.status==="SYNC_OK"&&synced.cloudMockOnly===false&&
       state.storage.pending===0&&state[profile+"Incidents"][0]?.cloudAcked===true&&
       state[profile+"Incidents"][0]?.ackCloudAcked===true;
     const second=profile==="property"?{
       operation:"ALERT",incidentId:"M63-2",assetId:"PUMP-02",severity:"WARNING"
     }:{operation:"OPEN",incidentId:"M63-2",unitId:"CABIN-08",category:"MAINTENANCE",severity:"WARNING"};
     await req(edgeUrl,profile+"/incidents",second,edgeToken);
     await req(edgeUrl,profile+"/incidents",{operation:"ACK",incidentId:"M63-2"},edgeToken);
     const before=await adminStatus(cloudUrl);
     dropAck=true;
     const dropped=await req(edgeUrl,"lab/cloud-lite/sync",{},edgeToken);
     const partial=await req(edgeUrl,"state",null,edgeToken);
     const after=await adminStatus(cloudUrl);
     checks[profile+"_LOST_ACK_NO_LOCAL_ADVANCE"]=dropped.http===409&&
       dropped.result?.status==="SYNC_INCOMPLETE"&&remoteAckAfterCommit===true&&
       after.eventsStored>before.eventsStored&&partial.storage.pending>0;
     const retried=await req(edgeUrl,"lab/cloud-lite/sync",{},edgeToken);
     const recovered=await req(edgeUrl,"state",null,edgeToken);
     const countAfter=await adminStatus(cloudUrl);
     checks[profile+"_DEDUP_ON_RETRY"]=retried.http===200&&
       retried.result?.duplicates>=1&&retried.result?.status==="SYNC_OK"&&
       recovered.storage.pending===0&&countAfter.eventsStored===after.eventsStored+1;
     observed.push({profile,cloudEventsStored:countAfter.eventsStored,
       network:"SYNTHETIC_WAN",transport:"REAL_LOOPBACK_HTTP",
       lostAckRecovered:checks[profile+"_DEDUP_ON_RETRY"]});
     const sessionBefore=recovered.identity.sessionId;
     await activeEdge.close();activeEdge=null;
     activeEdge=createAutonomousEdgeHost({config,token:edgeToken,cloudTransport:bridge});
     edgeUrl=await activeEdge.listen();const reopened=await req(edgeUrl,"state",null,edgeToken);
     checks[profile+"_EDGE_REOPEN"]=reopened.identity.sessionId!==sessionBefore&&
       reopened.runtimeHealth==="HEALTHY"&&reopened.cloudLite.configured===true&&
       reopened.storage.pending<=1&&
       reopened[profile+"Incidents"].some(x=>x.incidentId==="M63-2"&&
         x.status==="ACKNOWLEDGED"&&x.cloudAcked===true&&x.ackCloudAcked===true);
     await activeEdge.close();activeEdge=null;
   }
   const ok=Object.values(checks).every(Boolean);
   return {kind:"PEF_M63_EDGE_CLOUD_LITE_LOCAL_SYNC_V1",ok,
     status:ok?"LAB_PASS":"LAB_FAIL",checks,observed,
     protocol:"HTTP_LOOPBACK_BEARER_AND_HMAC_ACK",
     realEdgeAutonomousHost:true,realCloudLiteHttp:true,
     offlineBootPreserved:true,lostAckDedupValidated:ok,
     cloudMockReplacedInThisTest:true,defaultMockDeleted:false,
     platform:process.platform,arch:process.arch,
     remoteTlsValidated:false,physicalValidated:false,additionalHostingEuro:0};
 }finally{
   if(activeEdge)await activeEdge.close();
   await cloud.close();fs.rmSync(root,{recursive:true,force:true});
 }
}
module.exports={runM63EdgeSyncSmoke};
