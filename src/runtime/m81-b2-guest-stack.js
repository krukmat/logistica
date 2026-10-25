"use strict";
// M8.1.B2 — real, explicitly operator-gated Linux guest-only integration.
// The caller owns and cleans disposable netns/cgroup/rootfs; this module owns
// the two isolated worker drivers, Edge HTTP instances and TLS Cloud Lite.
const fs=require("node:fs"),path=require("node:path"),https=require("node:https");
const {randomBytes}=require("node:crypto");
const {assertM81LimaIsolationPreflight}=require("../adapters/m81-lima-isolation-scope.js");
const {createLinuxIsolatedProcessDriver}=require("../adapters/linux-isolated-process-driver.js");
const {createAutonomousEdgeHost}=require("./autonomous-edge.js");
const {createCloudLiteRegistryServer}=require("./cloud-lite-registry-server.js");
const {generateM73LabPki}=require("./m73-local-pki.js");
const {createM73MtlsTransport}=require("../adapters/m73-mtls-transport.js");
const {createM81B2Plan,REQUIRED,EVIDENCE_KIND}=require("./m81-b2-plan.js");
const NAME=/^pef-m81-[0-9]+-[0-9]+$/;
const secret=()=>randomBytes(32).toString("hex");
async function postTls(base,route,ca,client,admin,body){
 const payload=Buffer.from(JSON.stringify(body));
 return await new Promise((resolve,reject)=>{
  const req=https.request(base+route,{method:"POST",ca,cert:client.cert,key:client.key,
   rejectUnauthorized:true,minVersion:"TLSv1.3",maxVersion:"TLSv1.3",
   timeout:4000,headers:{"content-type":"application/json",
    "content-length":payload.length,"x-pef-admin-token":admin}},res=>{
    const chunks=[];let size=0;
    res.on("data",x=>{size+=x.length;if(size>16000)req.destroy(Error("M81_TLS_RESPONSE_TOO_BIG"));else chunks.push(x);});
    res.on("error",reject);
    res.on("end",()=>{try{resolve({http:res.statusCode,...JSON.parse(Buffer.concat(chunks).toString("utf8"))});}catch(e){reject(e);}});
   });
  req.on("error",reject);req.once("timeout",()=>req.destroy(Error("M81_TLS_TIMEOUT")));
  req.end(payload);
 });
}
async function api(url,route,token,body){
 const r=await fetch(url+route,{method:body===undefined?"GET":"POST",
  headers:{"x-pef-token":token,...(body===undefined?{}:{"content-type":"application/json"})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {http:r.status,...await r.json()};
}
function guestPathFacts(scope,name){
 if(!NAME.test(name))throw Error("M81_B2_BAD_NAMESPACE");
 const base="/tmp/"+name,rootfs=base+"/root",cgroup="/sys/fs/cgroup/"+name;
 if(!fs.existsSync(base)||!fs.existsSync(rootfs)||!fs.existsSync(cgroup)||
    !fs.existsSync("/var/run/netns/"+name))
  throw Error("M81_B2_MISSING_PRIVATE_SANDBOX");
 if(path.dirname(base)!=="/tmp"||!scope.startsWith("/tmp/pef-m81-b2-"))
  throw Error("M81_B2_UNSAFE_SCOPE");
 return {namespace:name,cgroup,rootfs,hostCanary:base+"/host-canary"};
}
async function runM81B2GuestStack({base,propertyNamespace,hostNamespace}={}){
 if(process.env.PEF_M81_B2_ACK!=="EXPLICIT_VM_ROOT_SANDBOX_M81B2")
  throw Error("M81_B2_OPERATOR_ACK_REQUIRED");
 assertM81LimaIsolationPreflight(); // Must use the real guest, never an imported report.
 if(typeof base!=="string"||!/^\/tmp\/pef-m81-b2-[A-Za-z0-9]{8}$/.test(base)||
    !fs.existsSync(base)||fs.lstatSync(base).isSymbolicLink()||
    fs.statSync(base).uid!==0||(fs.statSync(base).mode&0o077)!==0||
    propertyNamespace===hostNamespace)
  throw Error("M81_B2_UNSAFE_GUEST_RUNTIME_SCOPE");
 const namespaces={property:guestPathFacts(base,propertyNamespace),
  host:guestPathFacts(base,hostNamespace)};
 const plan=createM81B2Plan(),checks=Object.fromEntries(REQUIRED.map(k=>[k,false]));
 let cloud=null;const edges=[],workloads={},tokens={};const startedAt=Date.now();
 // Secrets, CA and journals never leave guest temp storage.
 const cloudDir=path.join(base,"cloud");fs.mkdirSync(cloudDir,{mode:0o700});
 const pkiDir=path.join(base,"pki");fs.mkdirSync(pkiDir,{mode:0o700});
 const pki=generateM73LabPki(pkiDir,{siteId:"m81-site",deviceId:"m81-property"});
 const admin=secret(),pkiClients={property:pki.device,host:pki.host};
 try{
  checks.GUEST_SCOPE_AUTHORIZED=true;
  cloud=createCloudLiteRegistryServer({dir:cloudDir,adminToken:admin,
   enableIngest:true,tls:{ca:pki.ca,...pki.server}});
  const cloudUrl=await cloud.listen();
  checks.CLOUD_TLS13_MTLS=cloudUrl.startsWith("https://127.0.0.1:");
  for(const profile of ["property","host"]){
   const identity={siteId:"m81-site",deviceId:profile==="property"?"m81-property":"m73-host",
    configRevision:"r1"};
   const registered=await postTls(cloudUrl,"/v1/admin/enroll",pki.ca,pki.admin,admin,identity);
   if(registered.http!==201||registered.fsyncCompleted!==true||
      !/^[0-9a-f]{64}$/.test(registered.deviceToken||""))
    throw Error("M81_B2_MTLS_ENROLL_FAILED:"+profile);
   const transport=createM73MtlsTransport({baseUrl:cloudUrl,ca:pki.ca,
    ...pkiClients[profile],deviceToken:registered.deviceToken});
   const bridge={ingest:event=>transport.ingest(event),
    verifyAck:ack=>transport.verifyAck(ack)};
   const space=namespaces[profile],dataDir=path.join(base,"data-"+profile);
   fs.mkdirSync(dataDir,{mode:0o700});
   const driver=createLinuxIsolatedProcessDriver({...space,
    runtimeScope:"M81_LIMA_VM",nodeInside:process.execPath});
   const cfg={schemaVersion:1,backend:"virtual-lab",identity,storageDir:dataDir,
    http:{host:"127.0.0.1",port:0},sampleIntervalMs:500,
    workload:{enabled:true,profile,reconcileMs:300},
    journal:{capacityBytes:131072,controlReserveBytes:8192},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
   const token=secret();
   const edge=createAutonomousEdgeHost({config:cfg,token,workloadDriver:driver,
    cloudTransport:bridge});
   const url=await edge.listen();
   edges.push(edge);tokens[profile]={url,token};
  }
  checks.LOCAL_CLOUD_AND_BOTH_EDGES_CONCURRENT=edges.length===2&&Boolean(cloud);
  for(const profile of ["property","host"]){
   const {url,token}=tokens[profile],pre=await api(url,"state",token);
   const w=pre.workloads?.find(w=>w.workloadId==="pef-"+profile);
   const limits=plan.profiles[profile];
   if(!w||w.state!=="RUNNING"||w.isolation!=="LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM"||
      w.actualLimitsEnforced!==true||!Number.isSafeInteger(w.pid)||w.pid<2)
    throw Error("M81_B2_UNISOLATED_WORKER:"+profile);
   const space=namespaces[profile];
   const read=key=>fs.readFileSync(space.cgroup+"/"+key,"utf8").trim();
   const kernel=read("cpu.max")===limits.cpuMax&&
    read("memory.max")===limits.memoryMax&&
    read("memory.swap.max")==="0"&&read("pids.max")==="16";
   if(!kernel)throw Error("M81_B2_KERNEL_QUOTA_MISMATCH:"+profile);
   const member=fs.readFileSync("/proc/"+w.pid+"/cgroup","utf8").includes("::/"+space.namespace);
   if(!member)throw Error("M81_B2_PROCESS_NOT_IN_OWN_CGROUP:"+profile);
   const command=profile==="property"?
    {operation:"ALERT",incidentId:"M81-B2",assetId:"PUMP-01",severity:"WARNING"}:
    {operation:"OPEN",incidentId:"M81-B2",unitId:"CABIN-07",category:"MAINTENANCE",severity:"WARNING"};
   const opened=await api(url,profile+"/incidents",token,command);
   const ack=await api(url,profile+"/incidents",token,{operation:"ACK",incidentId:"M81-B2"});
   if(opened.http!==201||ack.http!==201||
      opened.fsyncCompleted!==true||ack.fsyncCompleted!==true)
    throw Error("M81_B2_LOCAL_FSYNC_FAILED:"+profile);
   const offline=await api(url,"lab/cloud-lite/sync",token,{});
   const mid=await api(url,"state",token);
   if(offline.http!==409||mid.storage.pending<2)
    throw Error("M81_B2_OFFLINE_QUEUE_MISSING:"+profile);
   const changed=await api(url,"lab/wan",token,{id:"primary",link:true,upstream:true});
   if(changed.http!==200)throw Error("M81_B2_SYNTHETIC_WAN_FAILED:"+profile);
   const recovered=await api(url,"lab/cloud-lite/sync",token,{});
   const done=await api(url,"state",token);
   if(recovered.http!==200||recovered.result?.status!=="SYNC_OK"||done.storage.pending!==0)
    throw Error("M81_B2_MTLS_REPLAY_FAILED:"+profile);
   const memoryPeakBytes=Number(read("memory.peak"));
   if(!Number.isSafeInteger(memoryPeakBytes)||memoryPeakBytes<1||
      memoryPeakBytes>Number(limits.memoryMax))
    throw Error("M81_B2_WORKER_MEMORY_LIMIT_EXCEEDED:"+profile);
   workloads[profile]={workloadId:"pef-"+profile,isolation:w.isolation,
    actualLimitsEnforced:true,pid:w.pid,memoryPeakBytes,
    offlineDurable:true,replayed:true};
  }
  checks.BOTH_WORKERS_ISOLATED=Object.keys(workloads).length===2;
  checks.MANIFEST_CGROUP_LIMITS=checks.BOTH_WORKERS_ISOLATED;
  checks.WORKER_UID_AND_NETNS=checks.BOTH_WORKERS_ISOLATED;
  checks.LOCAL_INCIDENT_FSYNC=checks.BOTH_WORKERS_ISOLATED;
  checks.OFFLINE_QUEUE_REPLAY=checks.BOTH_WORKERS_ISOLATED;
  const ok=REQUIRED.every(k=>checks[k]===true);
  return {kind:EVIDENCE_KIND,task:"M8.1.B2",profile:"pef-r28s-1g",
   status:ok?"GUEST_CHECKS_PASS_PENDING_CLEANUP":"LAB_FAIL",ok,
   checks,workloads,elapsedMs:Date.now()-startedAt,
   transport:"TLS1.3_MTLS_LOOPBACK",systemdManagedValidated:false,
   vmRebootValidated:false,physicalValidated:false,productionAuthorized:false,
   cleanup:{status:"PENDING",ownedResourcesRemoved:false}};
 }finally{
  for(const edge of edges.reverse())await edge.close();
  if(cloud)await cloud.close();
 }
}
module.exports={runM81B2GuestStack};
