"use strict";
// M6.2 real loopback durable HTTP ingest (not an Edge HTTP transport yet).
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {createCloudLiteRegistryServer}=require("./cloud-lite-registry-server.js");
const {createFileJournal}=require("../adapters/os-file-journal.js");
const {createLocalReceipts}=require("../core/local-receipts.js");
const {eventChecksum}=require("../core/event-envelope.js");
async function runM62IngestSmoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m62-cloud-"));
 const edgeDir=path.join(root,"edge");
 fs.mkdirSync(edgeDir,{mode:0o700});
 const cloudDir=path.join(root,"cloud");
 fs.mkdirSync(cloudDir,{mode:0o700});
 const admin=randomBytes(32).toString("hex"),identity={
   siteId:"m62-site",deviceId:"m62-receiver",configRevision:"r1"};
 let server=null,journal=null;
 const checks={},observed=[];
 const open=async()=>{
   server=createCloudLiteRegistryServer({dir:cloudDir,adminToken:admin,enableIngest:true});
   return await server.listen();
 };
 const request=async(url,route,body,token)=>{
   const response=await fetch(url+route,{method:body?"POST":"GET",
     headers:{"content-type":"application/json",...(token?{"x-pef-device-token":token}:{})},
     ...(body?{body:JSON.stringify(body)}:{})});
   return {http:response.status,...await response.json()};
 };
 try{
   let url=await open();
   const registration=await fetch(url+"/v1/admin/enroll",{method:"POST",
     headers:{"content-type":"application/json","x-pef-admin-token":admin},
     body:JSON.stringify(identity)});
   const registered=await registration.json(),token=registered.deviceToken;
   checks.ENROLLED_BEFORE_INGEST=registration.status===201&&registered.fsyncCompleted===true;
   journal=createFileJournal({dir:edgeDir,capacityBytes:65536,controlReserveBytes:4096});
   const receipt=createLocalReceipts({journal,identity});
   checks.LOCAL_SOURCE_FSYNC=receipt.receive({receiptId:"M62-1",packageId:"PKG-A"}).fsyncCompleted===true;
   const event=journal.pending()[0];
   checks.UNAUTHORIZED_DEVICE_DENIED=(await request(url,"/v1/device/ingest",event,null)).http===403;
   checks.INVALID_CHECKSUM_DENIED=(await request(url,"/v1/device/ingest",
     {...event,sha256:"0".repeat(64)},token)).http===400;
   const invalidCategory={...event,category:"O2"};
   invalidCategory.sha256=eventChecksum(invalidCategory);
   checks.CATEGORY_CONTRACT_DENIED=(await request(url,"/v1/device/ingest",invalidCategory,token)).http===400;
   const remote=await request(url,"/v1/device/ingest",event,token);
   checks.ACK_ONLY_AFTER_FSYNC=remote.http===200&&remote.ok===true&&
     remote.durable===true&&remote.fsyncCompleted===true&&remote.duplicate===false&&
     remote.sha256===event.sha256&&remote.eventId===event.eventId;
   const duplicate=await request(url,"/v1/device/ingest",event,token);
   checks.IDEMPOTENT_DUPLICATE=duplicate.http===200&&duplicate.durable===true&&
     duplicate.duplicate===true&&duplicate.fsyncCompleted===false;
   const conflict={...event,payload:{...event.payload,packageId:"PKG-B"}};
   conflict.sha256=eventChecksum(conflict);
   checks.CONFLICT_DENIED=(await request(url,"/v1/device/ingest",conflict,token)).http===409;
   const forged={...event,payload:{...event.payload,deviceId:"other-device"}};
   forged.sha256=eventChecksum(forged);
   checks.FOREIGN_SCOPE_DENIED=(await request(url,"/v1/device/ingest",forged,token)).http!==200;
   const status=await fetch(url+"/v1/admin/status",{headers:{"x-pef-admin-token":admin}}).then(x=>x.json());
   checks.ONLY_ONE_COMMITTED=status.eventsStored===1&&status.ingestionAvailable===true;
   observed.push({stage:"FIRST_INGEST",eventsStored:status.eventsStored,fsyncConfirmed:true});
   await server.close();server=null;
   url=await open();
   const replay=await request(url,"/v1/device/ingest",event,token);
   const status2=await fetch(url+"/v1/admin/status",{headers:{"x-pef-admin-token":admin}}).then(x=>x.json());
   checks.REOPEN_AND_REPLAY=replay.http===200&&replay.duplicate===true&&
     replay.durable===true&&status2.eventsStored===1;
   observed.push({stage:"REOPEN",eventsStored:status2.eventsStored,duplicateAck:true});
   await server.close();server=null;
   const filename=path.join(cloudDir,"pef-cloud-lite-events-v1.ndjson");
   fs.appendFileSync(filename,"{truncated\n");
   let corrupted=false;
   try{createCloudLiteRegistryServer({dir:cloudDir,adminToken:admin,enableIngest:true});}
   catch(e){corrupted=/CLOUD_LITE_EVENT_RECORD_CORRUPT/.test(e.message);}
   checks.CORRUPTED_LOG_FAIL_CLOSED=corrupted;
   const ok=Object.values(checks).every(Boolean);
   return {kind:"PEF_M62_CLOUD_LITE_DURABLE_INGEST_V1",status:ok?"LAB_PASS":"LAB_FAIL",
     ok,checks,observed,eventTypes:["RECEIPT_REGISTERED"],realHttpServer:true,
     sourceJournalFsync:true,cloudEventFileFsync:true,
     cloudEventCount:1,deviceCredentialAuthenticated:true,
     remoteTlsValidated:false,physicalValidated:false,cloudMockReplaced:false,
     edgeHttpTransportConnected:false,platform:process.platform,arch:process.arch,
     additionalHostingEuro:0};
 }finally{if(server)await server.close();journal?.close();fs.rmSync(root,{recursive:true,force:true});}
}
module.exports={runM62IngestSmoke};
