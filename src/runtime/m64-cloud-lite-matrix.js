"use strict";
// M6.4: real Edge/Cloud Lite localhost HTTP fault matrix. All state is disposable.
// WAN is synthetic; no external Cloud, TLS/PKI, hardware, physical powercut.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {createCloudLiteRegistryServer}=require("./cloud-lite-registry-server.js");
const {createCloudLiteHttpTransport}=require("../adapters/cloud-lite-http-transport.js");
const {createAutonomousEdgeHost}=require("./autonomous-edge.js");
const {runM63EdgeSyncSmoke}=require("./m63-edge-cloud-lite-smoke.js");
const {runM62IngestSmoke}=require("./m62-ingest-smoke.js");
const {runM61RegistrySmoke}=require("./m61-registry-smoke.js");

async function runM64CloudLiteMatrix(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m64-local-"));
 const cloudDir=path.join(root,"cloud");fs.mkdirSync(cloudDir,{mode:0o700});
 const admin=randomBytes(32).toString("hex");
 let cloud=null,edge=null,url=null,checks={},profiles={},observed=[];
 const request=async(base,route,body,token)=>{
  const resp=await fetch(base+route,{method:body?"POST":"GET",
   headers:{...(body?{"content-type":"application/json"}:{}),...(token?{"x-pef-token":token}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:resp.status,...await resp.json()};
 };
 const openCloud=async()=>{
  cloud=createCloudLiteRegistryServer({dir:cloudDir,adminToken:admin,enableIngest:true});
  url=await cloud.listen();
 };
 const count=async()=>await fetch(url+"/v1/admin/status",{headers:{"x-pef-admin-token":admin}})
   .then(r=>r.json()).then(r=>r.eventsStored);
 try{
  const registry=await runM61RegistrySmoke(),ingest=await runM62IngestSmoke(),
   integration=await runM63EdgeSyncSmoke();
  checks.REGISTRY_E2E=registry.ok===true&&Object.values(registry.checks).every(Boolean);
  checks.DURABLE_INGEST_E2E=ingest.ok===true&&Object.values(ingest.checks).every(Boolean);
  checks.EDGE_PROPERTY_HOST_E2E=integration.ok===true&&Object.values(integration.checks).every(Boolean);
  await openCloud();
  for(const profile of ["property","host"]){
   const identity={siteId:"m64-site",deviceId:"m64-"+profile,configRevision:"r1"};
   const enroll=await fetch(url+"/v1/admin/enroll",{method:"POST",
    headers:{"content-type":"application/json","x-pef-admin-token":admin},
    body:JSON.stringify(identity)});
   const registered=await enroll.json(),deviceToken=registered.deviceToken;
   const startCount=await count();
   let activeTransport=createCloudLiteHttpTransport({baseUrl:url,deviceToken});
   let forgeOnce=false;
   const bridge={
    async ingest(event){
     const ack=await activeTransport.ingest(event);
     if(forgeOnce&&ack.ok){
      forgeOnce=false;
      return {...ack,labProof:"0".repeat(64)};
     }
     return ack;
    },
    verifyAck:ack=>activeTransport.verifyAck(ack)
   };
   const storageDir=path.join(root,"edge-"+profile);
   fs.mkdirSync(storageDir,{mode:0o700});
   const config={schemaVersion:1,backend:"virtual-lab",identity,storageDir,
    http:{host:"127.0.0.1",port:0},sampleIntervalMs:250,
    workload:{enabled:true,profile,reconcileMs:200},
    journal:{capacityBytes:131072,controlReserveBytes:8192},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
   const operatorToken=randomBytes(32).toString("hex");
   edge=createAutonomousEdgeHost({config,token:operatorToken,cloudTransport:bridge});
   let edgeUrl=await edge.listen();
   const initial=await request(edgeUrl,"state",null,operatorToken);
   const command=profile==="property"?
    {operation:"ALERT",incidentId:"M64-1",assetId:"PUMP-01",severity:"WARNING"}:
    {operation:"OPEN",incidentId:"M64-1",unitId:"CABIN-07",category:"MAINTENANCE",severity:"WARNING"};
   const created=await request(edgeUrl,profile+"/incidents",command,operatorToken);
   const acknowledged=await request(edgeUrl,profile+"/incidents",{operation:"ACK",incidentId:"M64-1"},operatorToken);
   const offline=await request(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const offlineState=await request(edgeUrl,"state",null,operatorToken);
   const localOk=initial.network.connectivity==="LOCAL_ONLY"&&
    created.http===201&&created.fsyncCompleted===true&&
    acknowledged.http===201&&acknowledged.fsyncCompleted===true&&
    offline.http===409&&offline.error==="CLOUD_UNAVAILABLE"&&offlineState.storage.pending>=2;
   // Simulate WAN availability, followed by a genuine local Cloud Lite server outage.
   await request(edgeUrl,"lab/wan",{id:"primary",link:true,upstream:true},operatorToken);
   await request(edgeUrl,"lab/sample",{},operatorToken);
   await cloud.close();cloud=null;
   const cloudDown=await request(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const downState=await request(edgeUrl,"state",null,operatorToken);
   const outageOk=cloudDown.http===409&&cloudDown.result?.status==="SYNC_INCOMPLETE"&&
    downState.storage.pending>=2;
   await openCloud(); // new actual HTTP listener; fsync registry and events reopen
   // Wrong token first: no remote commit, no local cursor movement.
   activeTransport=createCloudLiteHttpTransport({baseUrl:url,deviceToken:randomBytes(32).toString("hex")});
   const denied=await request(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const deniedCount=await count();
   const wrongTokenOk=denied.http===409&&denied.result?.error==="AUTH_DENIED"&&
    deniedCount===startCount;
   // Valid token, deliberately forged authenticated ACK after successful remote fsync.
   activeTransport=createCloudLiteHttpTransport({baseUrl:url,deviceToken});
   forgeOnce=true;
   const forged=await request(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const forgedState=await request(edgeUrl,"state",null,operatorToken);
   const afterForged=await count();
   const forgeryOk=forged.http===409&&forged.result?.error==="INVALID_REMOTE_PROOF"&&
    afterForged>startCount&&forgedState.storage.pending>=2;
   const recovered=await request(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const after=await request(edgeUrl,"state",null,operatorToken);
   const stored=await count();
   const reconciledOk=recovered.http===200&&recovered.result?.status==="SYNC_OK"&&
    recovered.result?.duplicates>=1&&after.storage.pending===0&&
    after[profile+"Incidents"][0]?.cloudAcked===true&&
    after[profile+"Incidents"][0]?.ackCloudAcked===true&&stored>afterForged;
   const sessionId=after.identity.sessionId;
   await edge.close();edge=null;
   edge=createAutonomousEdgeHost({config,token:operatorToken,cloudTransport:bridge});
   edgeUrl=await edge.listen();
   const reopened=await request(edgeUrl,"state",null,operatorToken);
   const reopenedOk=reopened.identity.sessionId!==sessionId&&
    reopened[profile+"Incidents"][0]?.status==="ACKNOWLEDGED"&&
    reopened[profile+"Incidents"][0]?.cloudAcked===true&&
    reopened[profile+"Incidents"][0]?.ackCloudAcked===true;
   profiles[profile]={OFFLINE_LOCAL_FSYNC:localOk,CLOUD_OUTAGE_RETAINS_JOURNAL:outageOk,
    WRONG_DEVICE_TOKEN_DENIED:wrongTokenOk,FORGED_PROOF_FAIL_CLOSED:forgeryOk,
    AUTHENTICATED_REPLAY_DEDUP:reconciledOk,EDGE_REOPEN_PRESERVES_ACK:reopenedOk};
   observed.push({profile,remoteEvents:stored,preAuthDeniedEvents:startCount,
    afterForgedEvents:afterForged,duplicateOnReconcile:recovered.result?.duplicates,
    noPhysicalNetworking:true});
   await edge.close();edge=null;
  }
  const all=Object.values(profiles).flatMap(x=>Object.values(x));
  const ok=Object.values(checks).every(Boolean)&&all.length===12&&all.every(Boolean);
  return {kind:"PEF_M64_CLOUD_LITE_FAULT_MATRIX_V1",status:ok?"LAB_PASS":"LAB_FAIL",ok,
   checks,profiles,observed,assertions:all.length+Object.keys(checks).length,
   remoteCloud:"REAL_LOCALHOST_HTTP",legacyCloudMockRemoved:false,
   testedDeviceProfiles:["property","host"],signedAck:"LAB_HMAC_TOKEN_BOUND",
   independentServiceRestart:true,edgeJournalRetained:true,
   realTlsValidated:false,hardwareValidated:false,physicalPowerCutValidated:false,
   hostingRequired:false,additionalHostingEuro:0,platform:process.platform,arch:process.arch};
 }finally{
  if(edge)await edge.close();
  if(cloud)await cloud.close();
  fs.rmSync(root,{recursive:true,force:true});
 }
}
module.exports={runM64CloudLiteMatrix};
