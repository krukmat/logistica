#!/usr/bin/env node
"use strict";
// W1.10.D3: durable receipt writer held OPEN until killed; verify after process/VM crash.
// This cannot certify flash power-loss durability. Stores data ONLY under explicit guest disk dir.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {randomUUID,createHash}=require("node:crypto");
const {openEdgeService}=require("../src/runtime/edge-service.js");
const {createScriptedWanPorts}=require("../src/adapters/scripted-wan-ports.js");
const profiles=require("../docs/contracts/arm64-vm-profiles-v1.json").profiles;
const identity={siteId:"arm-lab",deviceId:"r28s-guest",configRevision:"r1"};
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const count=120,options={journalOptions:{capacityBytes:1024*1024,controlReserveBytes:4096}};
const argv=process.argv.slice(2);
function argumentsForD3(){
 let mode=null,profile="r28s-1g",baseDir=null,hostStopClaim=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==="--mode")mode=argv[++i];
  else if(argv[i]==="--profile")profile=argv[++i];
  else if(argv[i]==="--base-dir")baseDir=argv[++i];
  else if(argv[i]==="--host-force-stop-observed")hostStopClaim=true;
  else throw Error("D3_INVALID_ARGUMENT");
 }
 if(!["writer","inspect","verify"].includes(mode)||!profiles[profile]||
    !baseDir||!path.isAbsolute(baseDir))throw Error("D3_INVALID_ARGUMENT");
 const root=fs.realpathSync(baseDir);
 if(!fs.statSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())
   throw Error("D3_UNSAFE_STORAGE_ROOT");
 const dir=path.join(root,"d3-"+profile);
 if(!dir.startsWith(root+path.sep))throw Error("D3_UNSAFE_DATA_DIR");
 return {mode,profile,root,dir,hostStopClaim};
}
function syncJson(file,data){
 const tmp=file+".tmp";const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+"\n");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(tmp,file);
 const d=fs.openSync(path.dirname(file),"r");
 try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
}
function expected(){return Array.from({length:count},(_,i)=>({receiptId:"D3-"+i,packageId:"BOX-"+i}));}
function open(dir,sessionId){
 return openEdgeService({dir,identity,sessionId,ports:createScriptedWanPorts({
   primary:{link:true,upstream:false},backup:{link:true,upstream:false}}),...options});
}
function bootId(){return fs.readFileSync("/proc/sys/kernel/random/boot_id","utf8").trim();}
function pidStart(pid){const raw=fs.readFileSync("/proc/"+pid+"/stat","utf8");return raw.split(") ").pop().trim().split(/\s+/)[19];}
function inspect(dir){
 const file=path.join(dir,"prepared.json");
 if(!fs.existsSync(file))throw Error("D3_NOT_PREPARED");
 const manifest=JSON.parse(fs.readFileSync(file,"utf8"));
 if(manifest.kind!=="PEF_ARM64_D3_PREPARED_V1"||manifest.stage!=="OPEN_WRITER"||
   manifest.expected!==count||manifest.sha256!==hash(expected()))throw Error("D3_MANIFEST_BAD");
 const sameBoot=bootId()===manifest.bootId;
 const live=sameBoot&&fs.existsSync("/proc/"+manifest.pid+"/cmdline")&&
   fs.readFileSync("/proc/"+manifest.pid+"/cmdline","utf8").includes("pef-arm64-d3.js")&&
   pidStart(manifest.pid)===manifest.pidStart;
 return {manifest,writerStillLive:live};
}
function writer({dir,profile}){
 // Prevent reusing or deleting prior evidence without explicit operator cleanup.
 fs.mkdirSync(dir,{mode:0o700});
 const guest={platform:process.platform,arch:process.arch,memoryMiB:Math.floor(os.totalmem()/1048576)};
 if(process.platform!=="linux"||process.arch!=="arm64"||
   Math.abs(guest.memoryMiB-profiles[profile].memoryMiB)>profiles[profile].memoryMiB*0.12)
   throw Error("D3_CONSTRAINED_ARM64_VM_REQUIRED");
 const edge=open(dir,"d3-live-"+randomUUID());
 const receipts=expected();
 for(const r of receipts){
   const ack=edge.receivePackage(r);
   if(!ack.accepted||!ack.fsyncCompleted)throw Error("D3_UNSAFE_ACK:"+r.receiptId);
 }
 syncJson(path.join(dir,"prepared.json"),{kind:"PEF_ARM64_D3_PREPARED_V1",stage:"OPEN_WRITER",
  runId:randomUUID(),pid:process.pid,bootId:bootId(),pidStart:pidStart(process.pid),expected:count,sha256:hash(receipts),
  guest,physicalValidated:false,vmPowerLossVerified:false});
 process.stdout.write(JSON.stringify({kind:"PEF_ARM64_D3_READY",status:"OPEN_WRITER",pid:process.pid,
  accepted:count,readyForForceStop:true,physicalValidated:false})+"\n");
 // Intentionally do NOT close edge: the VM force-stop will terminate the active writer.
 setInterval(()=>{void edge;},1000);
}
function verify({dir,hostStopClaim}){
 const {manifest,writerStillLive}=inspect(dir);
 if(writerStillLive)throw Error("D3_WRITER_STILL_RUNNING");
 const edge=open(dir,"d3-recovery-"+randomUUID());
 let report;
 try{
  const got=edge.listReceipts();
  const expectedList=expected();
  const map=new Map(got.map(r=>[r.receiptId,r.packageId]));
  const retained=map.size===expectedList.length&&expectedList.every(r=>map.get(r.receiptId)===r.packageId);
  const idem=edge.receivePackage(expectedList[0]);
  const conflict=edge.receivePackage({receiptId:"D3-0",packageId:"DIFFERENT"});
  const noFalseAck=idem.accepted&&idem.duplicate&&!conflict.accepted&&conflict.error==="EVENT_ID_CONFLICT";
  const ok=retained&&noFalseAck;
  report={kind:"PEF_ARM64_D3_RECOVERY_V1",ok,
   status:ok?(hostStopClaim?"VM_FORCED_STOP_RECOVERY_OPERATOR_REPORTED":"PROCESS_EXIT_REOPEN_PASS"):"D3_RECOVERY_FAIL",
   evidenceOrigin:hostStopClaim?"LIMA_FORCE_STOP_HOST_CLI_SELF_REPORTED":"PROCESS_TERMINATION_ONLY",
   runId:manifest.runId,expected:manifest.expected,retained:got.length,
   duplicateAccepted:idem.accepted,duplicateDetected:idem.duplicate,
   conflictBlocked:!conflict.accepted&&conflict.error==="EVENT_ID_CONFLICT",
   writerStillLive,guest:manifest.guest,manifestHashMatches:manifest.sha256===hash(expectedList),
   journalBytes:fs.statSync(edge.journalPath).size,
   physicalValidated:false,physicalPowercutValidated:false,sdCardTested:false,
   deviceBackend:"BACKEND_NOT_IMPLEMENTED"};
 }finally{edge.close();}
 syncJson(path.join(dir,"recovery.json"),report);
 console.log(JSON.stringify(report));
 if(!report.ok)process.exitCode=1;
}
try{
 const opts=argumentsForD3();
 if(opts.mode==="writer")writer(opts);
 else if(opts.mode==="inspect"){
  const state=inspect(opts.dir);
  console.log(JSON.stringify({kind:"PEF_ARM64_D3_INSPECT",runId:state.manifest.runId,
    writerStillLive:state.writerStillLive,readyForForceStop:state.writerStillLive,
    physicalValidated:false}));
  if(!state.writerStillLive)process.exitCode=1;
 }else verify(opts);
}catch(err){console.error("PEF_D3_BLOCKED:"+String(err.message||err));process.exitCode=1;}
