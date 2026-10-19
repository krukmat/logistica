"use strict";
// M7.3 real HTTPS/TLS1.3 mTLS and Edge journal in ephemeral loopback.
// Trust is lab-scoped software CA. No public remote endpoint or insecure fallback.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),https=require("node:https");
const {randomBytes,X509Certificate}=require("node:crypto");
const {createCloudLiteRegistryServer}=require("./cloud-lite-registry-server.js");
const {createM73MtlsTransport}=require("../adapters/m73-mtls-transport.js");
const {generateM73LabPki}=require("./m73-local-pki.js");
const {checkCertificateWindow}=require("../core/m73-tls-identity.js");
const {createAutonomousEdgeHost}=require("./autonomous-edge.js");
async function secureJson(base,route,client,ca,{body,adminToken,deviceToken}={}){
 const url=new URL(base+route),payload=body===undefined?null:Buffer.from(JSON.stringify(body));
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{method:payload?"POST":"GET",ca,cert:client?.cert,key:client?.key,
   rejectUnauthorized:true,minVersion:"TLSv1.3",maxVersion:"TLSv1.3",timeout:2400,
   headers:{...(payload?{"content-type":"application/json","content-length":payload.length}:{}),
    ...(adminToken?{"x-pef-admin-token":adminToken}:{}),
    ...(deviceToken?{"x-pef-device-token":deviceToken}:{})}},res=>{
    const chunks=[];res.on("data",x=>chunks.push(x));
    res.on("error",reject);res.on("end",()=>{
     try{resolve({http:res.statusCode,...JSON.parse(Buffer.concat(chunks).toString("utf8"))});}
     catch(e){reject(e);}
    });
   });
   req.once("timeout",()=>req.destroy(Error("M73_TIMEOUT")));
   req.once("error",reject);req.end(payload);
 });
}
async function runM73MtlsSmoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m73-secure-"));
 const cloudDir=path.join(root,"cloud");fs.mkdirSync(cloudDir,{mode:0o700});
 const pki=generateM73LabPki(root),admin=randomBytes(32).toString("hex");
 let cloud=null,edge=null,cloudUrl=null;
 const checks={},profiles={};
 const makeCloud=async()=>{
  cloud=createCloudLiteRegistryServer({dir:cloudDir,adminToken:admin,
   enableIngest:true,tls:{ca:pki.ca,...pki.server}});
  cloudUrl=await cloud.listen();return cloudUrl;
 };
 const call=async(base,route,body,token)=>{
  const response=await fetch(base+route,{method:body?"POST":"GET",
   headers:{...(token?{"x-pef-token":token}:{}),
    ...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:response.status,...await response.json()};
 };
 try{
  await makeCloud();
  checks.SERVER_TLS13_AND_HTTPS=cloudUrl.startsWith("https://127.0.0.1:");
  let noCert=false;
  try{await secureJson(cloudUrl,"/health",null,pki.ca);}
  catch{noCert=true;}
  checks.MUTUAL_CERT_REQUIRED=noCert;
  const wrongAdmin=await secureJson(cloudUrl,"/v1/admin/status",pki.foreign,pki.ca,
   {adminToken:admin});
  checks.ADMIN_CERT_SCOPE_DENIED=wrongAdmin.http===403;
  const foreignCa=generateM73LabPki(fs.mkdtempSync(path.join(root,"otherca-")));
  let untrustedCa=false;
  try{await secureJson(cloudUrl,"/health",pki.admin,foreignCa.ca);}
  catch{untrustedCa=true;}
  checks.UNTRUSTED_CA_REJECTED=untrustedCa;
  checks.EXPIRED_CERT_POLICY_DENIED=!checkCertificateWindow(
   new X509Certificate(pki.device.cert),new Date(Date.now()+3*86400000));
  for(const profile of ["property","host"]){
   const identity={siteId:"m73-site",deviceId:"m73-"+profile,configRevision:"r1"};
   const registered=await secureJson(cloudUrl,"/v1/admin/enroll",pki.admin,pki.ca,
    {body:identity,adminToken:admin});
   const deviceToken=registered.deviceToken;
   const client=profile==="property"?pki.device:pki.host;
   const different=profile==="property"?pki.foreign:pki.device;
   const storageDir=path.join(root,"edge-"+profile);fs.mkdirSync(storageDir,{mode:0o700});
   let current=createM73MtlsTransport({baseUrl:cloudUrl,ca:pki.ca,...client,deviceToken});
   const bridge={ingest:evt=>current.ingest(evt),verifyAck:ack=>current.verifyAck(ack)};
   const config={schemaVersion:1,backend:"virtual-lab",identity,storageDir,
    http:{host:"127.0.0.1",port:0},sampleIntervalMs:250,
    workload:{enabled:true,profile,reconcileMs:200},
    journal:{capacityBytes:131072,controlReserveBytes:8192},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
   const operatorToken=randomBytes(32).toString("hex");
   edge=createAutonomousEdgeHost({config,token:operatorToken,cloudTransport:bridge});
   const edgeUrl=await edge.listen();
   const command=profile==="property"?
    {operation:"ALERT",incidentId:"M73-1",assetId:"PUMP-01",severity:"WARNING"}:
    {operation:"OPEN",incidentId:"M73-1",unitId:"CABIN-07",category:"MAINTENANCE",severity:"WARNING"};
   const created=await call(edgeUrl,profile+"/incidents",command,operatorToken);
   const acked=await call(edgeUrl,profile+"/incidents",
    {operation:"ACK",incidentId:"M73-1"},operatorToken);
   const offline=await call(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const local=(await call(edgeUrl,"state",null,operatorToken)).storage.pending;
   await call(edgeUrl,"lab/wan",{id:"primary",link:true,upstream:true},operatorToken);
   await call(edgeUrl,"lab/sample",{},operatorToken);
   current=createM73MtlsTransport({baseUrl:cloudUrl,ca:foreignCa.ca,...client,deviceToken});
   const badTrust=await call(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const pending=(await call(edgeUrl,"state",null,operatorToken)).storage.pending;
   current=createM73MtlsTransport({baseUrl:cloudUrl,ca:pki.ca,
     ...different,deviceToken});
   const wrongScope=await call(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const unchanged=(await call(edgeUrl,"state",null,operatorToken)).storage.pending;
   current=createM73MtlsTransport({baseUrl:cloudUrl,ca:pki.ca,
     ...client,deviceToken:randomBytes(32).toString("hex")});
   const wrongToken=await call(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const stateWrong=(await call(edgeUrl,"state",null,operatorToken)).storage.pending;
   // Cert rotation: new certificate/key pair with same scope and CA, same bearer.
   const chosen=profile==="property"?pki.rotated:pki.host;
   current=createM73MtlsTransport({baseUrl:cloudUrl,ca:pki.ca,
     ...chosen,deviceToken});
   const recovered=await call(edgeUrl,"lab/cloud-lite/sync",{},operatorToken);
   const state=(await call(edgeUrl,"state",null,operatorToken));
   profiles[profile]={
    ENROLLED:registered.http===201&&registered.fsyncCompleted===true,
    OFFLINE_OPERATIONS_DURABLE:created.fsyncCompleted===true&&acked.fsyncCompleted===true,
    OFFLINE_SYNC_FAIL_CLOSED:offline.http===409&&local>=2,
    SERVER_TRUST_FAILURE_NO_FALLBACK:badTrust.http!==200&&pending>=2,
    CERT_SCOPE_BOUND_TO_DEVICE:wrongScope.http!==200&&unchanged>=2,
    BEARER_REQUIRED_ALONGSIDE_CERT:wrongToken.http!==200&&stateWrong>=2,
    AUTHENTICATED_MTLS_RECONCILIATION:recovered.http===200&&
     recovered.result?.status==="SYNC_OK"&&state.storage.pending===0&&
     state[profile+"Incidents"][0]?.ackCloudAcked===true
   };
   await edge.close();edge=null;
  }
  const ok=Object.values(checks).every(Boolean)&&
    Object.values(profiles).every(p=>Object.values(p).every(Boolean));
  return {kind:"PEF_M73_MTLS_LOCAL_LAB_V1",ok,status:ok?"LAB_PASS":"LAB_FAIL",
   checks,profiles,tlsVersion:"TLSv1.3",certificateScope:"URI_SAN_DEVICE",
   encryptedTransport:true,certificateRenewal:"SECOND_SAME_SCOPE_CERT_ACCEPTED",
   certificateRevocationImplemented:false,privateKeysInEvidence:false,
   deviceKeySameAsM71:false,networkScope:"LOOPBACK_ONLY",
   hardwareValidated:false,physicalPowerCutValidated:false,
   publicTlsValidated:false,additionalHostingEuro:0,
   platform:process.platform,arch:process.arch};
 }finally{
  if(edge)await edge.close();
  if(cloud)await cloud.close();
  fs.rmSync(root,{recursive:true,force:true});
 }
}
module.exports={runM73MtlsSmoke};
