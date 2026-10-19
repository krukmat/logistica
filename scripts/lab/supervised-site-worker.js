"use strict";
// M5.5 actual GitHub-hosted kernel sandbox for both business overlays, with standalone Edge.
// Must only be invoked after scripts/lab/workload-isolation-smoke.sh guard/preflight.
const fs=require("node:fs"),path=require("node:path");
const {createLinuxIsolatedProcessDriver}=require("../../src/adapters/linux-isolated-process-driver.js");
const {makeLinuxIsolationPlan}=require("../../src/adapters/linux-workload-isolation.js");
const {propertyManifest,hostManifest}=require("../../src/runtime/demo-workload.js");
const {createAutonomousEdgeHost}=require("../../src/runtime/autonomous-edge.js");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function eventually(probe,limit=8000){
 const start=Date.now();
 while(Date.now()-start<limit){const x=await probe();if(x)return x;await wait(40);}
 throw Error("M55_TIMEOUT");
}
async function main(){
 const [profile,namespace,cgroup,rootfs,nodeInside,journalDir,canary]=process.argv.slice(2);
 if(!["property","host"].includes(profile))throw Error("M55_PROFILE_DENIED");
 const manifest=profile==="property"?propertyManifest():hostManifest(),plan=makeLinuxIsolationPlan(manifest);
 const driver=createLinuxIsolatedProcessDriver({namespace,cgroup,rootfs,nodeInside,hostCanary:canary});
 const started=[],checks={},token="ci-m55-ephemeral-operator-token-not-physical";
 const capture={async start(m,opts){const handle=await driver.start(m,opts);started.push(handle);return handle;}};
 const config={schemaVersion:1,backend:"virtual-lab",
   identity:{siteId:"m55-ci",deviceId:"m55-"+profile,configRevision:"r1"},
   storageDir:journalDir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:250,
   workload:{enabled:true,profile,reconcileMs:200},
   journal:{capacityBytes:65536,controlReserveBytes:4096},
   wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
 const post=profile==="property"?{operation:"ALERT",incidentId:"M55-1",assetId:"PUMP-01",severity:"WARNING"}:
   {operation:"OPEN",incidentId:"M55-1",unitId:"CABIN-07",category:"MAINTENANCE",severity:"WARNING"};
 const cmd={operation:"ACK",incidentId:"M55-1"},endpoint=profile+"/incidents",workerId="pef-"+profile;
 let edge=null,firstSession=null;
 const req=async(url,route,body)=>{
   const reply=await fetch(url+route,{method:body?"POST":"GET",
     headers:{"x-pef-token":token,...(body?{"content-type":"application/json"}:{})},
     ...(body?{body:JSON.stringify(body)}:{})});
   return {http:reply.status,...await reply.json()};
 };
 try{
   edge=createAutonomousEdgeHost({config,token,workloadDriver:capture});
   let url=await edge.listen(),state=await req(url,"state");
   firstSession=state.identity.sessionId;
   const current=state.workloads[0];
   checks.ACTIVE_PROFILE_KERNEL_ENFORCED=current?.workloadId===workerId&&
     current?.isolation==="LINUX_CGROUP_NETNS_CHROOT_CI"&&current.actualLimitsEnforced===true;
   checks.CPU_MEMORY_PID_LIMITS=fs.readFileSync(path.join(cgroup,"cpu.max"),"utf8").trim()===plan.cpuMax&&
     fs.readFileSync(path.join(cgroup,"memory.max"),"utf8").trim()===plan.memoryMax&&
     fs.readFileSync(path.join(cgroup,"pids.max"),"utf8").trim()===plan.pidsMax&&
     fs.readFileSync(path.join(cgroup,"memory.swap.max"),"utf8").trim()==="0";
   const created=await req(url,endpoint,post);
   checks.DURABLE_OFFLINE_CREATE=created.http===201&&created.fsyncCompleted===true&&
     state.network.connectivity==="LOCAL_ONLY";
   const badProfile=profile==="host"?"property":"host";
   checks.CROSS_PROFILE_DENIED=(await req(url,badProfile+"/incidents",post)).http===409;
   checks.INVALID_OPERATION_DENIED=(await req(url,endpoint,{...post,remoteShell:"sh"})).http===400;
   const activeHandle=started.at(-1);
   const crash=await activeHandle.injectCrash();
   checks.CHILD_CRASH_REQUESTED=crash.ok===true;
   await eventually(async()=>{const x=await req(url,"state");return x.workloads[0]?.state==="BACKOFF"?x:null;});
   checks.FAIL_CLOSED_IN_BACKOFF=(await req(url,endpoint,cmd)).http===409;
   await eventually(async()=>{const x=await req(url,"state");return x.workloads[0]?.state==="RUNNING"&&x.workloads[0]?.attempts>0?x:null;},10000);
   const afterCrash=await req(url,"state");
   checks.RECOVERED_KERNEL_ISOLATION=afterCrash.workloads[0].actualLimitsEnforced===true&&
     afterCrash.workloads[0].isolation==="LINUX_CGROUP_NETNS_CHROOT_CI";
   const ack=await req(url,endpoint,cmd);
   checks.DURABLE_ACK_AFTER_RESTART=ack.http===201&&ack.fsyncCompleted===true;
   await edge.close();edge=null;
   edge=createAutonomousEdgeHost({config,token,workloadDriver:capture});
   url=await edge.listen();state=await req(url,"state");
   checks.REOPEN_PERSISTS=state.identity.sessionId!==firstSession&&
     state[profile+"Incidents"][0]?.status==="ACKNOWLEDGED"&&
     state.workloads[0]?.actualLimitsEnforced===true;
   checks.AUTH_DENIED=(await fetch(url+endpoint)).status===403;
   checks.OFFLINE_CLOUD_REPLAY_DENIED=(await req(url,"lab/sync",{})).http===409;
   await req(url,"lab/wan",{id:"primary",upstream:true});
   await req(url,"lab/sample",{});
   const replay=await req(url,"lab/sync",{}),finalState=await req(url,"state");
   checks.CLOUD_MOCK_REPLAY=replay.http===200&&
     finalState.storage.pending===0&&finalState[profile+"Incidents"][0]?.cloudAcked===true&&
     finalState[profile+"Incidents"][0]?.ackCloudAcked===true;
   const ok=Object.values(checks).every(Boolean);
   if(!ok)throw Error("M55_ASSERTION_FAILED:"+JSON.stringify(checks));
   console.log("PEF_M55_PROFILE_PASS="+JSON.stringify({
     kind:"PEF_M55_KERNEL_SITE_OVERLAY_V1",profile,status:"LAB_PASS",ok,checks,
     cpuMax:plan.cpuMax,memoryMax:plan.memoryMax,pidsMax:plan.pidsMax,
     isolation:"LINUX_CGROUP_NETNS_CHROOT_CI",actualLimitsEnforced:true,
     forcedWorkerCrash:"ACTUAL_NODE_CHILD",network:"SYNTHETIC_EDGE_AND_KERNEL_ISOLATED_WORKER",
     cloud:"LOCAL_MOCK",physicalValidated:false,powerCutValidated:false,
     deviceServiceValidated:false,storageQuotaEnforced:false}));
 }finally{if(edge)await edge.close();}
}
main().catch(e=>{console.error("PEF_M55_SITE_FAIL:"+String(e.stack||e));process.exitCode=1;});
