"use strict";
// M5.1+M5.2: actual subprocess boot from versioned immutable temp-tree releases.
// No kernel/systemd activation; checks Linux and Darwin with same mechanism.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawn}=require("node:child_process");
const {randomBytes}=require("node:crypto");
const {applyRelease,verifyInstall,collect,hashEntries}=require("./m5-install.js");
const {validVersion,nextInstallState}=require("../core/install-policy.js");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(release,configFile,token){
 const bin=path.join(release,"bin/pef-edge.js");
 const child=spawn(process.execPath,[bin,"--config",configFile],{
   stdio:["ignore","pipe","pipe"],env:{PATH:process.env.PATH||"/usr/bin",LANG:"C",PEF_EDGE_TOKEN:token}});
 let stdout="",stderr="",done=false;
 child.stdout.on("data",data=>{stdout=(stdout+String(data)).slice(-20000);});
 child.stderr.on("data",data=>{stderr=(stderr+String(data)).slice(-10000);});
 child.on("exit",()=>{done=true;});
 try{
   let ready=null;
   for(let i=0;i<160;i++){
     const lines=stdout.split("\n");
     for(const line of lines){
       if(!line.includes('"kind":"PEF_EDGE_READY"'))continue;
       const message=JSON.parse(line);
       if(message.kind==="PEF_EDGE_READY"&&message.hardwareValidated===false)ready=message;
     }
     if(ready)return {child,url:ready.url,sessionId:ready.sessionId,
       scope:ready.scope,stderr:()=>stderr,closed:()=>done};
     if(done)throw Error("M5_PACKAGED_DAEMON_EXITED:"+stderr);
     await wait(40);
   }
   throw Error("M5_PACKAGED_DAEMON_TIMEOUT:"+stderr);
 }catch(e){
   child.kill("SIGKILL");
   throw e;
 }
}
async function halt(child){
 if(!child)return;
 if(child.exitCode!==null||child.signalCode!==null)return;
 const exited=new Promise(resolve=>child.once("close",resolve));
 child.kill("SIGTERM");
 const timeout=wait(3000).then(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");});
 await Promise.race([exited,timeout]);
 if(child.exitCode===null&&child.signalCode===null)
   await Promise.race([exited,wait(1500)]);
}
async function request(url,token,route,body){
 const response=await fetch(url+route,{method:body?"POST":"GET",
   headers:{"x-pef-token":token,...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
 return {http:response.status,...await response.json()};
}
async function runM5InstallSmoke({linuxRequired=false}={}){
 if(linuxRequired&&process.platform!=="linux")throw Error("M5_LINUX_CI_ONLY");
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"pef-m5-install-lab-"));
 const checks={},observed=[],token=randomBytes(32).toString("hex");
 let active=null;
 const configFile=path.join(root,"config.json");
 const config={schemaVersion:1,backend:"virtual-lab",
   identity:{siteId:"install-site",deviceId:"install-edge",configRevision:"r1"},
   storageDir:path.join(root,"data"),http:{host:"127.0.0.1",port:0},
   sampleIntervalMs:250,workload:{enabled:true,profile:"property",reconcileMs:250},
   journal:{capacityBytes:65536,controlReserveBytes:4096},
   wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
 try{
   checks.UNSAFE_ROOT_REFUSED=false;
   try{applyRelease({root:path.join(process.cwd(),"unwanted-m5-path"),version:"r1",mode:"install"});}
   catch(e){checks.UNSAFE_ROOT_REFUSED=/M5_TEMP_ROOT_ONLY/.test(e.message);}
   checks.INVALID_VERSION_REFUSED=!validVersion("../escape")&&
      !validVersion("..")&&!validVersion("bad/entry");
   const first=applyRelease({root,version:"v1",mode:"install"});
   checks.INSTALL_VERIFIED=first.ok===true&&first.status==="LAB_PASS"&&
      first.activeVersion==="v1"&&first.files>=20;
   const same=applyRelease({root,version:"v1",mode:"install"});
   checks.IDEMPOTENT_INSTALL=same.idempotent===true&&same.digest===first.digest;
   fs.writeFileSync(configFile,JSON.stringify(config)+"\n",{mode:0o600});
   active=await boot(first.releaseDir,configFile,token);
   const initial=await request(active.url,token,"state");
   checks.PACKAGED_PROCESS_BOOT=initial.activeOverlay==="property"&&
      initial.workloads.some(x=>x.workloadId==="pef-property"&&x.state==="RUNNING")&&
      active.scope==="LAB_ONLY";
   const incident={operation:"ALERT",incidentId:"M5-001",assetId:"PUMP-01",severity:"WARNING"};
   const created=await request(active.url,token,"property/incidents",incident);
   const ack=await request(active.url,token,"property/incidents",{operation:"ACK",incidentId:"M5-001"});
   checks.DURABLE_OPERATION=created.http===201&&created.fsyncCompleted===true&&
     ack.http===201&&ack.fsyncCompleted===true;
   const oldSession=initial.identity.sessionId;
   await halt(active.child);active=null;
   const upgraded=applyRelease({root,version:"v2",mode:"upgrade"});
   checks.UPGRADE_ATOMIC=upgraded.activeVersion==="v2"&&upgraded.previousVersion==="v1";
   const faultVersion="v3";
   let fault=false;
   try{applyRelease({root,version:faultVersion,mode:"upgrade",interruptBeforeActivation:true});}
   catch(e){fault=e.message==="M5_INJECTED_BEFORE_ACTIVATION";}
   checks.INTERRUPTED_UPGRADE_RETAINS_ACTIVE=fault&&verifyInstall(root).activeVersion==="v2";
   active=await boot(upgraded.releaseDir,configFile,token);
   const afterUpgrade=await request(active.url,token,"state");
   checks.RESTART_AFTER_UPGRADE_PERSISTS=afterUpgrade.identity.sessionId!==oldSession&&
     afterUpgrade.propertyIncidents.some(x=>x.incidentId==="M5-001"&&x.status==="ACKNOWLEDGED"&&
       x.cloudAcked===false);
   const wrong=(await request(active.url,token,"host/incidents",
      {operation:"OPEN",incidentId:"H-1",unitId:"CABIN-07",category:"MAINTENANCE",severity:"WARNING"}));
   checks.PROFILE_RESTRICTION=wrong.http===409;
   observed.push({stage:"UPGRADED_BOOT",profile:afterUpgrade.activeOverlay,
     pending:afterUpgrade.storage.pending,sessionId:afterUpgrade.identity.sessionId,
     runtimeHealth:afterUpgrade.runtimeHealth});
   await halt(active.child);active=null;
   const rolled=applyRelease({root,version:"v1",mode:"rollback"});
   checks.ROLLBACK_ATOMIC=rolled.activeVersion==="v1"&&rolled.previousVersion==="v2";
   active=await boot(rolled.releaseDir,configFile,token);
   const afterRollback=await request(active.url,token,"state");
   checks.ROLLBACK_PRESERVES_JOURNAL=afterRollback.propertyIncidents.some(
     x=>x.incidentId==="M5-001"&&x.status==="ACKNOWLEDGED")&&
     afterRollback.identity.sessionId!==afterUpgrade.identity.sessionId;
   observed.push({stage:"ROLLED_BACK_BOOT",profile:afterRollback.activeOverlay,
     pending:afterRollback.storage.pending,sessionId:afterRollback.identity.sessionId,
     runtimeHealth:afterRollback.runtimeHealth});
   await halt(active.child);active=null;
   // Explicit integrity rejection. Restore the file solely inside disposable test root.
   const target=path.join(root,"releases","v2","bin","pef-edge.js");
   const original=fs.readFileSync(target);
   fs.appendFileSync(target,"\n// deliberate corruption\n");
   let corrupted=false;
   try{verifyInstall(root);}catch(e){corrupted=/M5_RELEASE_DIGEST_MISMATCH/.test(e.message);}
   checks.TAMPER_DENIED=corrupted;
   fs.writeFileSync(target,original);
   checks.RECOVERED_VERIFICATION=verifyInstall(root).ok===true;
   checks.FOREIGN_ROLLBACK_REFUSED=false;
   try{applyRelease({root,version:"v3",mode:"rollback"});}
   catch(e){checks.FOREIGN_ROLLBACK_REFUSED=e.message==="M5_ROLLBACK_TARGET_DENIED";}
   checks.SOURCE_PACKAGED=hashEntries(collect())===first.digest;
   const ok=Object.values(checks).every(Boolean);
   return {kind:"PEF_M5_INSTALL_LINUX_LAB_V1",status:ok?"LAB_PASS":"LAB_FAIL",ok,
     platform:process.platform,arch:process.arch,node:process.version,
     checks,observed,releaseFiles:first.files,releaseDigest:first.digest,
     installedVersion:rolled.activeVersion,retainedRelease:"v2",
     storageScope:"EPHEMERAL_TMP_ONLY",actualChildProcess:true,
     childRestarts:3,wan:"SYNTHETIC",cloud:"LOCAL_MOCK",
     automaticBootService:"NOT_INSTALLED",systemdActivated:false,
     linuxServiceManagerIntegrationValidated:false,
     physicalValidated:false,realRebootValidated:false,powerCutValidated:false,
     kernelIsolationPropertyValidated:false,hardwareRequired:false};
 }finally{
   if(active)await halt(active.child);
   fs.rmSync(root,{recursive:true,force:true});
 }
}
module.exports={runM5InstallSmoke};
