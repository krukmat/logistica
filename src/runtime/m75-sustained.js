"use strict";
// M7.5.E: one persistent loopback TLS1.3 Cloud Lite and two Edge hosts, paced operations.
// Synthetic WAN failures, host fsync only. Not hardware, throughput or 72h certification.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const https=require("node:https");
const {randomBytes}=require("node:crypto");
const {performance}=require("node:perf_hooks");
const {createCloudLiteRegistryServer}=require("./cloud-lite-registry-server.js");
const {createAutonomousEdgeHost}=require("./autonomous-edge.js");
const {createM73MtlsTransport}=require("../adapters/m73-mtls-transport.js");
const {generateM73LabPki}=require("./m73-local-pki.js");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function resources(){
 const m=process.memoryUsage(),active={};
 for(const kind of (process.getActiveResourcesInfo?.()||[]))active[kind]=(active[kind]||0)+1;
 return {elapsedMs:0,pid:process.pid,rssBytes:m.rss,heapUsedBytes:m.heapUsed,
  heapTotalBytes:m.heapTotal,externalBytes:m.external,arrayBuffersBytes:m.arrayBuffers,
  activeResources:active};
}
function secureJson(base,route,client,ca,body=null,adminToken=null){
 const data=body===null?null:Buffer.from(JSON.stringify(body));
 return new Promise((resolve,reject)=>{
  const req=https.request(base+route,{method:data?"POST":"GET",ca,
   cert:client.cert,key:client.key,rejectUnauthorized:true,
   minVersion:"TLSv1.3",maxVersion:"TLSv1.3",timeout:2500,
   headers:{...(data?{"content-type":"application/json","content-length":data.length}:{}),
    ...(adminToken?{"x-pef-admin-token":adminToken}:{})}},res=>{
    const chunks=[];res.on("data",x=>chunks.push(x));
    res.on("error",reject);res.on("end",()=>{
     try{resolve({http:res.statusCode,...JSON.parse(Buffer.concat(chunks).toString("utf8"))});}
     catch(e){reject(e);}
    });
   });
  req.once("timeout",()=>req.destroy(Error("M75_TLS_TIMEOUT")));
  req.once("error",reject);req.end(data);
 });
}
async function runM75Sustained({durationSeconds=6,intervalMs=800}={}){
 if(!Number.isInteger(durationSeconds)||durationSeconds<4||durationSeconds>1800||
    !Number.isInteger(intervalMs)||intervalMs<400||intervalMs>5000)
  throw Error("M75_SUSTAINED_LIMITS_INVALID");
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m75-paced-"));
 const cloudDir=path.join(root,"cloud");fs.mkdirSync(cloudDir,{mode:0o700});
 let cloud=null,cloudUrl=null,pki,edges={},tokens={},transports={},configs={},edgeUrls={};
 const admin=randomBytes(32).toString("hex");
 const profiles=["property","host"],counts={property:0,host:0};
 let offlineFsync=true,wanRecovered=false,outageObserved=false,cloudRecovered=false;
 let localFailures=0,cloudOutageFailures=0,cloudEvents=0,reopened=false;
 const latencyMs=[],series=[],faults=[];
 const status=async()=>secureJson(cloudUrl,"/v1/admin/status",pki.admin,pki.ca,null,admin);
 const edgeCall=async(profile,route,body)=>{
  const response=await fetch(edgeUrls[profile]+route,{method:body?"POST":"GET",
   headers:{"x-pef-token":tokens[profile],...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:response.status,...await response.json()};
 };
 const openCloud=async()=>{
  cloud=createCloudLiteRegistryServer({dir:cloudDir,adminToken:admin,
    enableIngest:true,tls:{ca:pki.ca,...pki.server}});
  cloudUrl=await cloud.listen();
  for(const profile of profiles){
   if(!tokens[profile])continue;
   const client=profile==="property"?pki.device:pki.host;
   transports[profile]=createM73MtlsTransport({baseUrl:cloudUrl,ca:pki.ca,
    ...client,deviceToken:tokens[profile+"Device"]||tokens[profile]});
  }
 };
 try{
  pki=generateM73LabPki(root);
  await openCloud();
  for(const profile of profiles){
   const identity={siteId:"m75-site",deviceId:"m75-"+profile,configRevision:"r1"};
   const enrol=await secureJson(cloudUrl,"/v1/admin/enroll",pki.admin,pki.ca,identity,admin);
   if(enrol.http!==201||enrol.fsyncCompleted!==true||!enrol.deviceToken)
    throw Error("M75_ENROLL_FAILED:"+profile);
   tokens[profile]=enrol.deviceToken;
   const client=profile==="property"?pki.device:pki.host;
   transports[profile]=createM73MtlsTransport({baseUrl:cloudUrl,ca:pki.ca,
    ...client,deviceToken:tokens[profile]});
   const storageDir=path.join(root,"edge-"+profile);
   fs.mkdirSync(storageDir,{mode:0o700});
   configs[profile]={schemaVersion:1,backend:"virtual-lab",identity,storageDir,
    http:{host:"127.0.0.1",port:0},sampleIntervalMs:250,
    workload:{enabled:true,profile,reconcileMs:200},
    journal:{capacityBytes:3145728,controlReserveBytes:65536},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
   tokens[profile+"Operator"]=randomBytes(32).toString("hex");
   const bridge={ingest:event=>transports[profile].ingest(event),
    verifyAck:ack=>transports[profile].verifyAck(ack)};
   edges[profile]=createAutonomousEdgeHost({config:configs[profile],
    token:tokens[profile+"Operator"],cloudTransport:bridge});
   edgeUrls[profile]=await edges[profile].listen();
   // Edge HTTP operator credential differs from Cloud mTLS device bearer.
   tokens[profile]=tokens[profile+"Operator"];
   // Preserve Cloud device credential separately when transport is recreated.
   tokens[profile+"Device"]=enrol.deviceToken;
  }
  // Restore transport construction source on Cloud restart from device tokens.
  const start=performance.now(),deadline=start+durationSeconds*1000;
  let index=0,up=false,down=false,recovery=false,firstOffline=true;
  while(performance.now()<deadline){
   const elapsed=performance.now()-start;
   const progress=elapsed/(durationSeconds*1000);
   if(progress>=0.20&&!up){
    for(const p of profiles){
     await edgeCall(p,"lab/wan",{id:"primary",link:true,upstream:true});
     await edgeCall(p,"lab/sample",{});
    }
    up=true;wanRecovered=true;faults.push("WAN_SYNTHETIC_RESTORED");
   }
   if(progress>=0.43&&!down){
    await cloud.close();cloud=null;down=true;faults.push("REAL_CLOUD_LITE_HTTP_DOWN");
   }
   if(progress>=0.75&&!recovery){
    await openCloud();recovery=true;cloudRecovered=true;
    faults.push("REAL_CLOUD_LITE_HTTP_RESTARTED");
   }
   const p=profiles[index%2],incidentId="M75-"+p+"-"+index;
   const body=p==="property"?
    {operation:"ALERT",incidentId,assetId:"PUMP-01",severity:"WARNING"}:
    {operation:"OPEN",incidentId,unitId:"CABIN-07",category:"MAINTENANCE",severity:"WARNING"};
   const begin=performance.now();
   const created=await edgeCall(p,p+"/incidents",body);
   const ack=await edgeCall(p,p+"/incidents",{operation:"ACK",incidentId});
   const accepted=created.http===201&&created.fsyncCompleted===true&&
    ack.http===201&&ack.fsyncCompleted===true;
   if(!accepted){localFailures++;break;}
   counts[p]+=2;
   if(firstOffline){
    const st=await edgeCall(p,"state",null);
    offlineFsync=st.storage.pending>=2;
    firstOffline=false;
   }
   if(up&&down&&!recovery&&!outageObserved){
    const failed=await edgeCall(p,"lab/cloud-lite/sync",{});
    const st=await edgeCall(p,"state",null);
    outageObserved=failed.http===409&&st.storage.pending>=2;
    cloudOutageFailures++;
   }
   if(up&&!down||recovery){
    const result=await edgeCall(p,"lab/cloud-lite/sync",{});
    if(result.http!==200||result.result?.status!=="SYNC_OK"){
     localFailures++;break;
    }
   }
   latencyMs.push(Math.round(performance.now()-begin));
   const resource=resources();resource.elapsedMs=Math.round(performance.now()-start);
   series.push(resource);
   index++;
   const remaining=deadline-performance.now();
   if(remaining>0)await sleep(Math.min(intervalMs,remaining));
  }
  // Require each profile to have recorded a durable operation, then reconcile after recovery.
  if(cloud){
   for(const p of profiles){
    const result=await edgeCall(p,"lab/cloud-lite/sync",{});
    if(result.http!==200||result.result?.status!=="SYNC_OK")localFailures++;
   }
   const before=await status();cloudEvents=before.eventsStored||0;
   await cloud.close();cloud=null;await openCloud();
   const after=await status();
   reopened=after.eventsStored===cloudEvents;
  }
  let pending=0,retained=true;
  for(const p of profiles){
   const before=await edgeCall(p,"state",null);
   pending+=before.storage.pending;
   const session=before.identity.sessionId;
   await edges[p].close();edges[p]=null;
   const bridge={ingest:event=>transports[p].ingest(event),
    verifyAck:ack=>transports[p].verifyAck(ack)};
   edges[p]=createAutonomousEdgeHost({config:configs[p],
    token:tokens[p],cloudTransport:bridge});
   edgeUrls[p]=await edges[p].listen();
   const after=await edgeCall(p,"state",null);
   retained=retained&&after.identity.sessionId!==session&&
    after.storage.pending===0&&before.storage.pending===0;
  }
  const actualMs=Math.round(performance.now()-start);
  const checks={PERSISTENT_EDGE_PROPERTY_HOST:counts.property>0&&counts.host>0,
   OFFLINE_LOCAL_FSYNC:offlineFsync,REAL_MTLS_CLOUD_RECOVERED:wanRecovered&&cloudRecovered,
   REAL_HTTP_CLOUD_OUTAGE_OBSERVED:outageObserved&&cloudOutageFailures>0,
   DURABLE_RECONCILIATION_NO_PENDING:pending===0,
   CLOUD_LEDGER_REOPEN_MATCHES:reopened&&cloudEvents>=counts.property+counts.host,
   EDGE_REOPEN_RETAINS_ACK:retained,
   ALL_ACCEPTED_LOCAL_ACTIONS_FSYNC:localFailures===0};
  const ok=Object.values(checks).every(Boolean);
  return {kind:"PEF_M75_SUSTAINED_MTLS_LAB_V1",status:ok?"LAB_PASS":"LAB_FAIL",ok,
   checks,requestedSeconds:durationSeconds,elapsedMs:actualMs,intervalMs,
   generatedDurableOperations:counts,remoteStoredEvents:cloudEvents,localFailures,
   medianOperationPairLatencyMs:latencyMs.length?latencyMs.sort((a,b)=>a-b)[Math.floor(latencyMs.length/2)]:null,
   resourceSamples:series,faults,resourceAttribution:"HARNESS_PARENT_ONLY",
   workerRssValidated:false,sameLongLivedEdgeAndCloud:true,realTls:true,
   syntheticWan:true,physicalValidated:false,powerCutValidated:false,
   seventyTwoHourRetentionValidated:false,soak24hValidated:false,
   scope:"PACED_LOCALHOST_MTLS_TEST_NOT_FULL_LOAD_OR_PHYSICAL_PILOT"};
 }finally{
  for(const p of profiles){if(edges[p])await edges[p].close();}
  if(cloud)await cloud.close();
  fs.rmSync(root,{recursive:true,force:true});
 }
}
module.exports={runM75Sustained};
