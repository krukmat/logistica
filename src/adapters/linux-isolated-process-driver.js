"use strict";
// S3.4 / M8.1.B1: two explicit, disjoint OS-lab authorization scopes.
// CI legacy scope unchanged; Lima guest scope requires real root/systemd/VM/kernel checks.
// Never permit unisolated fallback, unattended production or macOS privileged execution.
const fs=require("node:fs");
const path=require("node:path");
const {spawn}=require("node:child_process");
const {makeLinuxIsolationPlan,assertHostedLinuxIsolationPreflight}=require("./linux-workload-isolation.js");
const {assertM81LimaIsolationPreflight}=require("./m81-lima-isolation-scope.js");
const CI_NAME=/^pef-s3-[0-9]+-[0-9]+$/,M81_NAME=/^pef-m81-[0-9]+-[0-9]+$/;
// The 16-PID B1 workload quota includes all Node native threads, not only processes.
// Keep the guest's V8 worker pool small instead of increasing manifest cgroup quotas.
const M81_NODE_FLAGS=Object.freeze(["--v8-pool-size=1"]);
function m81KernelExitDiagnostic({signal,code,stderr="",cgroup,read=fs.readFileSync}={}){
 const counter=(file,key)=>{
  try{
   const data=read(path.join(cgroup,file),"utf8");
   const found=key?data.match(new RegExp("^"+key+"\\s+(\\d+)$","m")):
    data.trim().match(/^(\d+)$/);
   return found?Number(found[1]):null;
  }catch{return null;}
 };
 const observations=[
  ["pidsMaxHits",counter("pids.events","max")],
  ["memoryOom",counter("memory.events","oom")],
  ["memoryOomKill",counter("memory.events","oom_kill")],
  ["memoryPeakBytes",counter("memory.peak")]
 ].filter(([,n])=>Number.isSafeInteger(n));
 const suffix=observations.map(([k,n])=>k+"="+n).join(",");
 const raw=String(stderr).replace(/[\r\n\t]+/g," ");
 const log=raw.length>1000?raw.slice(0,600)+" [MIDDLE_TRUNCATED] "+raw.slice(-380):raw;
 return "EXIT_"+(signal||code)+
  (suffix?":cgroup{"+suffix+"}":"")+(log?":stderr="+log:"");
}
function createLinuxIsolatedProcessDriver({namespace,cgroup,rootfs,nodeInside,hostCanary,
  runtimeScope="GITHUB_HOSTED_CI"}={}){
  if(!["GITHUB_HOSTED_CI","M81_LIMA_VM"].includes(runtimeScope))
    throw Error("LAB_BLOCKED:unknown-driver-scope");
  const inGuest=runtimeScope==="M81_LIMA_VM";
  const assertScope=inGuest?assertM81LimaIsolationPreflight:assertHostedLinuxIsolationPreflight;
  assertScope();
  if(typeof namespace!=="string"||!(inGuest?M81_NAME:CI_NAME).test(namespace)||
     cgroup!=="/sys/fs/cgroup/"+namespace||typeof rootfs!=="string"||
     !path.isAbsolute(rootfs)||!rootfs.startsWith("/tmp/")||
     typeof nodeInside!=="string"||!path.isAbsolute(nodeInside)||
     !fs.existsSync("/var/run/netns/"+namespace))
    throw Error("LAB_BLOCKED:invalid-isolation-scope");
  const real=fs.realpathSync(rootfs);
  if(inGuest){
    const base="/tmp/"+namespace,expectedRoot=base+"/root";
    const netns="/var/run/netns/"+namespace;
    if(rootfs!==expectedRoot||real!==expectedRoot||hostCanary!==base+"/host-canary"||
       !["/usr/bin/node","/usr/local/bin/node"].includes(nodeInside)||
       fs.lstatSync(base).isSymbolicLink()||fs.lstatSync(rootfs).isSymbolicLink()||
       fs.statSync(base).uid!==0||fs.statSync(real).uid!==0||
       (fs.statSync(base).mode&0o077)!==0||
       (fs.statSync(real).mode&0o022)!==0||
       fs.realpathSync(cgroup)!==cgroup||fs.statSync(cgroup).uid!==0||
       fs.lstatSync(netns).isSymbolicLink()||fs.statSync(netns).uid!==0||
       fs.lstatSync(hostCanary).isSymbolicLink()||
       fs.statSync(hostCanary).uid!==0||!fs.statSync(hostCanary).isFile()||
       (fs.statSync(hostCanary).mode&0o077)!==0)
      throw Error("M81_LIMA_SCOPE_OWNERSHIP_OR_PATH_BLOCKED");
  }
  if(!real.startsWith("/tmp/")||!fs.statSync(real).isDirectory()||
     !fs.statSync(cgroup).isDirectory()||!fs.statSync(path.join(real,nodeInside)).isFile()||
     !fs.statSync(path.join(real,inGuest?"app/workloads/site-operations-worker.js":
       "app/receiver-worker.js")).isFile())
    throw Error("LAB_BLOCKED:invalid-sandbox-root");
  const verifyLimit=(file,expected)=>{
    if(fs.readFileSync(path.join(cgroup,file),"utf8").trim()!==expected)
      throw Error("LAB_BLOCKED:kernel-limit-mismatch:"+file);
  };
  let active=null;
  function member(pid){
    try{return fs.readFileSync("/proc/"+pid+"/cgroup","utf8").split("\n")
      .some(line=>line.endsWith("::/"+namespace)||line.includes("::/"+namespace+"\n"));}catch{return false;}
  }
  async function isStopped(pid){
    for(let i=0;i<50;i++){
      try{
        const content=fs.readFileSync("/proc/"+pid+"/status","utf8");
        if(/^State:\s+T/m.test(content))return;
      }catch{break;}
      await new Promise(r=>setTimeout(r,10));
    }
    throw Error("LAB_WORKER_DID_NOT_STOP");
  }
  return {
    async start(manifest,{onExit}={}){
      assertScope();
      if(active)throw Error("LAB_WORKLOAD_ALREADY_ACTIVE");
      if(typeof onExit!=="function")throw Error("INVALID_ONEXIT_PORT");
      const plan=makeLinuxIsolationPlan(manifest);
      const workerId=manifest.workload_id;
      const isSite=workerId==="pef-property"||workerId==="pef-host";
      if(inGuest&&!isSite)throw Error("M81_LIMA_SITE_WORKER_ONLY");
      const profile=workerId==="pef-property"?"property":workerId==="pef-host"?"host":null;
      const workerFile=isSite?"/app/workloads/site-operations-worker.js":"/app/receiver-worker.js";
      if(!fs.existsSync(path.join(real,workerFile))||
        !fs.statSync(path.join(real,workerFile)).isFile())
        throw Error("LAB_BLOCKED:worker-not-staged:"+workerId);
      verifyLimit("cpu.max",plan.cpuMax);
      verifyLimit("memory.max",plan.memoryMax);
      verifyLimit("memory.swap.max",plan.memorySwapMax);
      verifyLimit("pids.max",plan.pidsMax);
      const argv=["-c",'kill -STOP "$$"; exec "$@"',"pef-worker",
        "ip","netns","exec",namespace,"chroot","--userspec=65534:65534",
        real,nodeInside,...(inGuest?M81_NODE_FLAGS:[]),workerFile];
      const child=spawn("/bin/sh",argv,{detached:true,stdio:["ignore","pipe","pipe","ipc"],
        env:{PATH:"/usr/sbin:/usr/bin:/bin",LANG:"C",
          ...(inGuest?{UV_THREADPOOL_SIZE:"1"}:{}),
          PEF_ALLOW_FAULT_INJECTION:inGuest?"M81_ISOLATED_WORKER":"CI_ISOLATED_WORKER",
          PEF_HOST_SENTINEL:hostCanary||"/host-cannot-be-reached",
          ...(isSite?{PEF_SITE_PROFILE:profile,PEF_WORKLOAD_ID:workerId}:{})}});
      active=child;
      let closed=false,stopping=false,ready=false,nextId=0;
      let stdErr="",stdErrHead="",stderrBytes=0;
      child.stderr.on("data",d=>{const data=String(d);
        stderrBytes+=data.length;stdErrHead=(stdErrHead+data).slice(0,650);
        stdErr=(stdErr+data).slice(-1500);});
      child.stdout.resume();
      const pending=new Map();
      const fail=e=>{
        if(closed)return;
        closed=true;
        if(active===child)active=null;
        for(const [id,p] of pending){clearTimeout(p.timer);p.reject(Error("WORKER_EXITED"));pending.delete(id);}
        if(!stopping)onExit(String(e));
      };
      child.on("exit",(code,signal)=>fail(inGuest?
        m81KernelExitDiagnostic({code,signal,stderr:stderrBytes>1500?
          stdErrHead+" [MIDDLE_TRUNCATED] "+stdErr:stdErr,cgroup}):
        "EXIT_"+(signal||code)));
      child.on("error",err=>fail("ERROR_"+(err.code||err.message)));
      const killGroup=signal=>{try{process.kill(-child.pid,signal);}catch(e){if(e.code!=="ESRCH")throw e;}};
      const request=(type,body={},deadlineMs=1500)=>new Promise((resolve,reject)=>{
        if(closed||!child.connected)return reject(Error("WORKER_UNAVAILABLE"));
        const id=String(++nextId);
        const timer=setTimeout(()=>{pending.delete(id);reject(Error("WORKER_IPC_TIMEOUT"));},deadlineMs);
        pending.set(id,{resolve,reject,timer});
        try{child.send({type,id,...body},err=>{
          if(err&&pending.has(id)){clearTimeout(timer);pending.delete(id);reject(err);}
        });}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
      });
      child.on("message",m=>{
        if(m?.type==="READY"&&m.id===workerId)ready=true;
        if(m?.type==="REPLY"&&pending.has(m.id)){
          const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);p.resolve(m);
        }
      });
      try{
        await isStopped(child.pid);
        if(!member(child.pid))fs.writeFileSync(path.join(cgroup,"cgroup.procs"),String(child.pid));
        if(!member(child.pid))throw Error("LAB_WORKER_CGROUP_UNVERIFIED");
        killGroup("SIGCONT");
        for(let i=0;i<100&&!ready&&!closed;i++)await new Promise(r=>setTimeout(r,20));
        if(!ready||closed)throw Error("LAB_WORKER_READY_TIMEOUT:"+stdErr);
        const verified=await request("ISOLATION");
        if(!verified.ok||verified.uid!==65534||verified.hostCanaryInaccessible!==true||
           verified.networkDenied!==true)
          throw Error("LAB_ISOLATION_UNVERIFIED:"+JSON.stringify(verified));
      }catch(e){
        stopping=true;
        try{killGroup("SIGKILL");}catch{}
        if(active===child)active=null;
        throw e;
      }
      return {isolation:inGuest?"LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM":
         "LINUX_CGROUP_NETNS_CHROOT_CI",actualLimitsEnforced:true,
        kernelLimits:{cpuMax:plan.cpuMax,memoryMax:plan.memoryMax,pidsMax:plan.pidsMax,
          storageQuotaEnforced:false},pid:child.pid,
        async health(){
          if(closed||!member(child.pid))return {ok:false,error:"NOT_IN_CGROUP"};
          return await request("HEALTH",{},15000);
        },
        processReceipt:body=>workerId==="pef-receiver"?request("RECEIPT",body):
          Promise.resolve({ok:false,error:"OPERATION_NOT_ALLOWED"}),
        processOperation:(operation,input)=>{
          if(!isSite||operation!==profile.toUpperCase())
            return Promise.resolve({ok:false,error:"OPERATION_NOT_ALLOWED"});
          return request("SITE_OPERATION",{input});
        },
        injectCrash:async()=>{const res=await request("CRASH");
          return {ok:true,expectedState:"BACKOFF",sent:res.ok};},
        fault:async type=>{
          if(!["CPU_BURN","MEMORY_PRESSURE"].includes(type))throw Error("FAULT_NOT_ALLOWLISTED");
          const response=await request(type);
          return response;
        },
        async stop(){
          stopping=true;
          if(!closed){
            const exit=new Promise(resolve=>child.once("exit",resolve));
            killGroup("SIGTERM");
            const timer=setTimeout(()=>killGroup("SIGKILL"),500);
            try{await Promise.race([exit,new Promise(resolve=>setTimeout(resolve,1000))]);}
            finally{clearTimeout(timer);killGroup("SIGKILL");}
          }
          if(active===child)active=null;
        }
      };
    },
    inspection:()=>({kind:inGuest?"M81_LIMA_ISOLATED_PROCESS_DRIVER":
      "CI_LINUX_ISOLATED_PROCESS_DRIVER",
      authorizedScope:runtimeScope,driverPrepared:true,guestExecutionValidated:false,
      enforcedBy:"cgroup v2 + netns + chroot + uid 65534",hardwareValidated:false})
  };
}
module.exports={createLinuxIsolatedProcessDriver,m81KernelExitDiagnostic,M81_NODE_FLAGS};
