"use strict";
// M6.1 actual localhost HTTP and fsync-backed registry; ephemeral, no external services.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {randomBytes}=require("node:crypto");
const {createCloudLiteRegistryServer}=require("./cloud-lite-registry-server.js");
async function runM61RegistrySmoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m61-cloud-"));
 const admin=randomBytes(32).toString("hex");
 const scope={siteId:"m61-site",deviceId:"m61-property",configRevision:"r1"};
 const other={siteId:"m61-site",deviceId:"m61-host",configRevision:"r1"};
 let cloud=null,token=null;const checks={};const phases=[];
 async function open(){
  cloud=createCloudLiteRegistryServer({dir:root,adminToken:admin,port:0});
  return await cloud.listen();
 }
 const request=async(url,method,route,body,header={})=>{
  const response=await fetch(url+route,{method,headers:{
    ...(body?{"content-type":"application/json"}:{}),...header},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {http:response.status,...await response.json()};
 };
 try{
  let url=await open();
  const status=await request(url,"GET","/v1/admin/status",null,{"x-pef-admin-token":admin});
  checks.EMPTY_REGISTRY=status.http===200&&status.registered===0&&status.ingestionAvailable===false;
  checks.UNAUTHORIZED_ENROLL_DENIED=(await request(url,"POST","/v1/admin/enroll",scope)).http===403;
  checks.BAD_IDENTITY_DENIED=(await request(url,"POST","/v1/admin/enroll",
    {...scope,extra:"forbidden"},{"x-pef-admin-token":admin})).http===400;
  const registered=await request(url,"POST","/v1/admin/enroll",scope,{"x-pef-admin-token":admin});
  token=registered.deviceToken;
  checks.ENROLL_DURABLE=registered.http===201&&registered.ok===true&&
    registered.fsyncCompleted===true&&/^[a-f0-9]{64}$/.test(token);
  const file=path.join(root,"pef-cloud-lite-registry-v1.json");
  const persisted=fs.readFileSync(file,"utf8");
  checks.NO_PLAINTEXT_CREDENTIAL=!persisted.includes(token)&&
    JSON.parse(persisted).devices[0].credentialHash.length===64;
  checks.DUPLICATE_BLOCKED=(await request(url,"POST","/v1/admin/enroll",scope,
    {"x-pef-admin-token":admin})).http===409;
  checks.ADMIN_ISOLATION=(await request(url,"GET","/v1/admin/status")).http===403&&
    (await request(url,"GET","/v1/admin/status",null,
    {"x-pef-device-token":token})).http===403;
  checks.REGISTERED_TOKEN_ACCEPTED=(await request(url,"POST","/v1/device/authenticate",
    scope,{"x-pef-device-token":token})).http===200;
  checks.WRONG_CREDENTIAL_DENIED=(await request(url,"POST","/v1/device/authenticate",
    scope,{"x-pef-device-token":randomBytes(32).toString("hex")})).http===403;
  checks.FOREIGN_IDENTITY_DENIED=(await request(url,"POST","/v1/device/authenticate",
    other,{"x-pef-device-token":token})).http===403;
  checks.REVISION_MISMATCH_DENIED=(await request(url,"POST","/v1/device/authenticate",
    {...scope,configRevision:"r2"},{"x-pef-device-token":token})).http===403;
  checks.LOCAL_HOST_RESTRICTED=false;
  try{createCloudLiteRegistryServer({dir:root,adminToken:admin,host:"0.0.0.0"});}
  catch(e){checks.LOCAL_HOST_RESTRICTED=e.message==="CLOUD_LITE_LOCALHOST_ONLY";}
  checks.SINGLE_WRITER_LOCK=false;
  try{createCloudLiteRegistryServer({dir:root,adminToken:admin});}
  catch(e){checks.SINGLE_WRITER_LOCK=e.message==="EDGE_ALREADY_RUNNING";}
  const hostClaim=await fetch(url+"/health",{headers:{Host:"example.com"}}).then(x=>x.status);
  checks.HOST_HEADER_REJECTED=hostClaim===403;
  phases.push({phase:"BEFORE_RESTART",registered:1,authorized:true});
  await cloud.close();cloud=null;
  url=await open();
  const reopened=await request(url,"GET","/v1/admin/status",null,{"x-pef-admin-token":admin});
  const authAgain=await request(url,"POST","/v1/device/authenticate",scope,
    {"x-pef-device-token":token});
  checks.PERSISTED_AFTER_RESTART=reopened.registered===1&&authAgain.http===200;
  const newHost=await request(url,"POST","/v1/admin/enroll",other,{"x-pef-admin-token":admin});
  checks.MULTIPLE_DEVICE_SCOPES=newHost.http===201&&
    (await request(url,"POST","/v1/device/authenticate",other,
    {"x-pef-device-token":token})).http===403;
  phases.push({phase:"AFTER_RESTART",registered:2,authorized:true});
  const ok=Object.values(checks).every(Boolean);
  return {kind:"PEF_M61_CLOUD_LITE_REGISTRY_V1",status:ok?"LAB_PASS":"LAB_FAIL",
    ok,checks,phases,protocol:"HTTP_LOOPBACK_WITH_BEARER_TOKENS",
    registryStorage:"FSYNC_ATOMIC_FILE_SHA256_CREDENTIAL_HASHES",
    actualHttpServer:true,processRestarts:1,registeredDeviceCount:2,
    credentialsExposedInEvidence:false,remoteTlsValidated:false,
    eventIngestionAvailable:false,cloudMockReplaced:false,
    platform:process.platform,arch:process.arch,
    hardwareValidated:false,hostingCostEuro:0};
 }finally{if(cloud)await cloud.close();fs.rmSync(root,{recursive:true,force:true});}
}
module.exports={runM61RegistrySmoke};
