"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawn}=require("node:child_process");
const {runM3LifecycleSmoke}=require("../src/emulator/lab/m3-lifecycle-smoke.js");
const {createManagedEdge}=require("../src/runtime/m3-process-manager.js");
const dirPrefix=()=>fs.mkdtempSync(path.join(os.tmpdir(),"pef-m3-"));
function config(dir){
 const o={schemaVersion:1,backend:"virtual-lab",
  identity:{siteId:"m3-test-site",deviceId:"m3-test-edge",configRevision:"r1"},
  storageDir:dir,http:{host:"127.0.0.1",port:0},sampleIntervalMs:5000,
  workload:{enabled:false,reconcileMs:200},
  journal:{capacityBytes:65536,controlReserveBytes:4096},
  wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
 const file=path.join(dir,"config.json");fs.writeFileSync(file,JSON.stringify(o));return file;
}
function awaitReady(child,timeout=9000){
 return new Promise((resolve,reject)=>{
  let out="",err="";
  const timer=setTimeout(()=>reject(Error("M3_TEST_TIMEOUT:"+err)),timeout);
  const onData=b=>{
   out+=b.toString();
   for(const line of out.split("\n")){
    try{const obj=JSON.parse(line);
      if((obj.type==="READY"||obj.type==="RESTART_BUDGET_EXHAUSTED")&&obj.kind==="PEF_M3_LIFECYCLE_V1"){
       cleanup();resolve(obj);return;
      }
    }catch{}
   }
  };
  const cleanup=()=>{clearTimeout(timer);child.stdout?.off("data",onData);};
  child.stdout.on("data",onData);
  child.stderr?.on("data",b=>{err+=b.toString();});
  child.once("exit",(c)=>{cleanup();reject(Error("M3_TEST_EXIT:"+c+":"+err));});
 });
}
async function stopChild(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 child.kill("SIGTERM");
 await Promise.race([new Promise(r=>child.once("exit",r)),new Promise(r=>setTimeout(r,4000))]);
 if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");
  await new Promise(r=>child.once("exit",r));}
}
test("M3.1 genuine child SIGKILL, automatic restart and receipt recovery with no dashboard",async()=>{
 const e=await runM3LifecycleSmoke();
 assert.equal(e.ok,true,JSON.stringify(e));assert.equal(e.supervisorRestarted,true);
 assert.equal(e.receiptRetained,true);assert.equal(e.stoppedGracefully,true);
});
test("M3.1 manager rejects invalid policy and never accepts absent token",()=>{
 const dir=dirPrefix();
 try{
  const file=config(dir);
  assert.throws(()=>createManagedEdge({configFile:file,token:"short"}),/M3_OPERATOR_TOKEN_REQUIRED/);
  assert.throws(()=>createManagedEdge({configFile:file,token:"a".repeat(32),maxRestarts:200}),
    /M3_INVALID_RECOVERY_POLICY/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("M3.2 Linux kernel flock holds one supervisor across lifetime and releases after stop",
 {skip:process.platform!=="linux"},async()=>{
 const dir=dirPrefix(),file=config(dir),root=path.resolve(__dirname,"..");
 const launcher=path.join(root,"scripts/m3/linux-locked-supervisor.sh");
 const token="m3-linux-test-token-with-enough-chars";
 const env={...process.env,PEF_EDGE_TOKEN:token};
 const create=()=>spawn("bash",[launcher,file],{cwd:root,env,stdio:["ignore","pipe","pipe"]});
 let first=null,second=null,third=null;
 try{
  first=create();const up=await awaitReady(first);
  assert.equal(up.type,"READY");
  second=create();
  const secondExit=await new Promise(resolve=>second.once("exit",resolve));
  assert.equal(secondExit,75,"Linux flock must reject competing manager");
  await stopChild(first);first=null;
  third=create();const fresh=await awaitReady(third);
  assert.equal(fresh.type,"READY","Lock must release after owner shutdown");
 }finally{
  await Promise.all([first,second,third].filter(Boolean).map(stopChild));
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test("M3.2 restart budget is finite: second SIGKILL halts after one permitted restart",async()=>{
 const dir=dirPrefix(),file=config(dir),token="bounded-m3-test-secret-token-123456";
 const manager=createManagedEdge({configFile:file,token,maxRestarts:1,restartDelayMs:120,
  healthIntervalMs:1000});
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  const before=await manager.start();
  assert.equal(before.phase,"RUNNING");
  manager.crashForLab();
  let after=null;
  for(let i=0;i<100;i++){
   const s=manager.status();
   if(s.phase==="RUNNING"&&s.pid!==before.pid){after=s;break;}
   await wait(35);
  }
  assert.ok(after,"M3 did not restart the first crash");
  manager.crashForLab();
  for(let i=0;i<100&&manager.status().phase!=="SAFE_MODE";i++)await wait(35);
  assert.equal(manager.status().phase,"SAFE_MODE","Must not restart infinitely");
  assert.equal(manager.status().restartCount,1);
 }finally{await manager.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
