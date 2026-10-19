"use strict";
// M6.1 real HTTP registry, loopback only. Transport is not mTLS/production trust.
const http=require("node:http"),https=require("node:https");
const {X509Certificate}=require("node:crypto");
const {randomBytes,timingSafeEqual}=require("node:crypto");
const {planEnroll,findRegistered,checkedIdentity}=require("../core/cloud-lite-registry-policy.js");
const {createFileRegistryStore,digestCredential}=require("../adapters/cloud-lite-registry-file.js");
const {createCloudLiteEventStore}=require("../adapters/cloud-lite-event-file.js");
const {validateCloudLiteEvent}=require("../core/cloud-lite-ingest-policy.js");
const {VERSION,signCloudLiteAck}=require("../adapters/cloud-lite-ack-proof.js");
function sameSecret(candidate,expected){
 if(typeof candidate!=="string"||typeof expected!=="string"||
    !candidate||!expected)return false;
 const a=Buffer.from(candidate),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function createCloudLiteRegistryServer({dir,adminToken,host="127.0.0.1",port=0,enableIngest=false,tls=null}={}){
 if(tls!==null&&(!tls||!Buffer.isBuffer(tls.ca)||!Buffer.isBuffer(tls.key)||!Buffer.isBuffer(tls.cert)))
   throw Error("M73_TLS_CONFIG_INVALID");
 if(host!=="127.0.0.1"||!Number.isInteger(port)||port<0||port>65535)
   throw Error("CLOUD_LITE_LOCALHOST_ONLY");
 if(typeof adminToken!=="string"||!/^[a-f0-9]{64}$/.test(adminToken))
   throw Error("CLOUD_LITE_ADMIN_TOKEN_REQUIRED");
 if(typeof enableIngest!=="boolean")throw Error("CLOUD_LITE_INVALID_INGEST_OPTION");
 const store=createFileRegistryStore({dir});
 let eventStore=null;
 try{if(enableIngest)eventStore=createCloudLiteEventStore({dir:store.root});}
 catch(e){store.close();throw e;}
 const dummy="0".repeat(64);
 let boundPort=null,closed=false;
 const send=(res,status,data)=>{
   res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
     "X-Content-Type-Options":"nosniff","Cache-Control":"no-store",
     "X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'none'"});
   res.end(JSON.stringify(data));
 };
 async function body(req,maxBytes=2048){
   if(req.headers["content-type"]?.split(";")[0]!=="application/json")
     throw Error("CLOUD_LITE_JSON_REQUIRED");
   const chunks=[];let count=0;
   for await(const chunk of req){
     count+=chunk.length;if(count>maxBytes)throw Error("CLOUD_LITE_BODY_TOO_LARGE");
     chunks.push(chunk);
   }
   let parsed;
   try{parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
   catch{throw Error("CLOUD_LITE_INVALID_JSON");}
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
     throw Error("CLOUD_LITE_INVALID_BODY");
   return parsed;
 }
 const server=(tls?https.createServer({ca:tls.ca,key:tls.key,cert:tls.cert,
    requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.3",
    maxVersion:"TLSv1.3"}):http.createServer()).on("request",(req,res)=>{void (async()=>{
   if(tls){
     if(!req.socket.authorized){send(res,403,{ok:false,error:"M73_CLIENT_CERT_REQUIRED"});return;}
     const peer=req.socket.getPeerCertificate();
     if(!peer?.raw){send(res,403,{ok:false,error:"M73_CLIENT_CERT_REQUIRED"});return;}
     const scope=require("../core/m73-tls-identity.js").certificateScope(new X509Certificate(peer.raw));
     if(req.url==="/v1/device/ingest"){
       // Body identity is compared later, after bounded parsing and validation.
       req.m73ClientScope=scope;
     }else if(req.url==="/v1/admin/enroll"||req.url==="/v1/admin/status"){
       if(scope!=="admin"){send(res,403,{ok:false,error:"M73_ADMIN_CERT_DENIED"});return;}
     }else if(req.url==="/v1/device/authenticate"){
       req.m73ClientScope=scope;
     }
   }
   if(!["127.0.0.1:"+boundPort,"localhost:"+boundPort].includes(req.headers.host)){
     send(res,403,{ok:false,error:"HOST_DENIED"});return;
   }
   if(req.method==="GET"&&req.url==="/health"){
     send(res,200,{ok:true,kind:"PEF_CLOUD_LITE_LOCAL_HEALTH",scope:"LOCAL_LAB_ONLY"});return;
   }
   if(req.method==="GET"&&req.url==="/v1/admin/status"){
     if(!sameSecret(req.headers["x-pef-admin-token"],adminToken)){
       send(res,403,{ok:false,error:"AUTH_DENIED"});return;}
     const devices=store.read();
     send(res,200,{kind:"PEF_CLOUD_LITE_REGISTRY_STATUS_V1",ok:true,
       registered:devices.length,credentialsPersistedAsHashes:true,
       ingestionAvailable:enableIngest,eventsStored:eventStore?.status().stored||0,
       cloudMockOnly:false,realHttpServer:true,
       physicalValidated:false,remoteTlsValidated:!!tls});return;
   }
   if(req.method==="POST"&&req.url==="/v1/device/ingest"&&enableIngest){
     const provided=req.headers["x-pef-device-token"];
     if(typeof provided!=="string"||!digestCredential(provided)){
       send(res,403,{ok:false,durable:false,error:"AUTH_DENIED"});return;
     }
     let event;
     try{event=await body(req,16384);}
     catch(e){send(res,400,{ok:false,durable:false,error:e.message});return;}
     const valid=validateCloudLiteEvent(event);
     if(!valid.ok){send(res,400,{ok:false,durable:false,error:valid.error});return;}
     if(tls&&req.m73ClientScope!=="device/"+valid.scope.siteId+"/"+valid.scope.deviceId){
       send(res,403,{ok:false,durable:false,error:"M73_CERT_SCOPE_DENIED"});return;
     }
     const registered=findRegistered(store.read(),valid.scope);
     const digest=digestCredential(provided);
     const equal=registered?.credentialHash||dummy;
     if(!registered||!sameSecret(digest,equal)){
       send(res,403,{ok:false,durable:false,error:"AUTH_DENIED"});return;
     }
     const result=eventStore.ingest(event);
     if(!result.ok){
       const status=result.error==="EVENT_ID_CONFLICT"?409:
         result.error==="CLOUD_LITE_EVENT_STORE_UNSAFE"?503:
         result.error==="CLOUD_LITE_EVENT_CAPACITY"?507:400;
       send(res,status,{ok:false,durable:false,error:result.error});return;
     }
     const ack={kind:"PEF_CLOUD_LITE_DURABLE_ACK_V1",ok:true,durable:true,
       eventId:event.eventId,sha256:event.sha256,...valid.scope,
       duplicate:result.duplicate,fsyncCompleted:!result.duplicate,
       protocolVersion:VERSION,
       actualHttpServer:true,localOnly:true,remoteTlsValidated:false,
       physicalValidated:false};
     ack.labProof=signCloudLiteAck(ack,provided);
     send(res,200,ack);
     return;
   }
   if(req.method!=="POST"||!["/v1/admin/enroll","/v1/device/authenticate"].includes(req.url)){
     send(res,404,{ok:false,error:"NOT_FOUND"});return;
   }
   const enrollment=req.url==="/v1/admin/enroll";
   if(enrollment&&!sameSecret(req.headers["x-pef-admin-token"],adminToken)){
     send(res,403,{ok:false,error:"AUTH_DENIED"});return;
   }
   // Authentication is bearer-token based and limited to localhost.
   if(!enrollment&&(!req.headers["x-pef-device-token"]||
      typeof req.headers["x-pef-device-token"]!=="string")){
     send(res,403,{ok:false,error:"AUTH_DENIED"});return;
   }
   let input;
   try{input=await body(req);}catch(e){send(res,400,{ok:false,error:e.message});return;}
   if(enrollment){
     let choice;
     try{choice=planEnroll(store.read(),input);}
     catch(e){send(res,400,{ok:false,error:e.message});return;}
     if(!choice.ok){send(res,409,{ok:false,error:choice.error});return;}
     const deviceToken=randomBytes(32).toString("hex");
     const stored=store.append({...choice.scope,credentialHash:digestCredential(deviceToken)});
     // Credential returned ONCE after durable local save. Loss of this response
     // requires deliberate operator re-provisioning (not implemented in M6.1).
     send(res,201,{kind:"PEF_CLOUD_LITE_ENROLLED_V1",ok:true,...choice.scope,
       deviceToken,fsyncCompleted:stored.fsyncCompleted,credentialReveal:"ONCE",
       transport:"HTTP_LOOPBACK_ONLY",physicalValidated:false});
   }else{
     let identity;
     try{identity=checkedIdentity(input);}
     catch{send(res,403,{ok:false,error:"AUTH_DENIED"});return;}
     if(tls&&req.m73ClientScope!=="device/"+identity.siteId+"/"+identity.deviceId){
       send(res,403,{ok:false,error:"M73_CERT_SCOPE_DENIED"});return;
     }
     const found=findRegistered(store.read(),identity);
     const digest=digestCredential(req.headers["x-pef-device-token"]);
     const equal=found?found.credentialHash:dummy;
     if(!digest||!sameSecret(digest,equal)||!found){
       send(res,403,{ok:false,error:"AUTH_DENIED"});return;
     }
     send(res,200,{kind:"PEF_CLOUD_LITE_DEVICE_AUTH_V1",ok:true,...identity,
       authenticated:true,transport:"HTTP_LOOPBACK_ONLY",
       ingestionAvailable:false,remoteTlsValidated:false,physicalValidated:false});
   }
 })().catch(()=>{
   if(!res.headersSent)send(res,503,{ok:false,error:"CLOUD_LITE_UNAVAILABLE"});
   else res.destroy();
 });});
 return {
   async listen(){
     if(closed||server.listening)throw Error("CLOUD_LITE_NOT_STARTABLE");
     try{await new Promise((resolve,reject)=>{
       server.once("error",reject);
       server.listen(port,host,()=>{server.off("error",reject);resolve();});
     });}catch(e){store.close();closed=true;throw e;}
     boundPort=server.address().port;
     return (tls?"https://":"http://")+"127.0.0.1:"+boundPort;
   },
   async close(){
     if(closed)return;closed=true;
     try{if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
     finally{try{eventStore?.close();}finally{store.close();}}
   }
 };
}
module.exports={createCloudLiteRegistryServer};
