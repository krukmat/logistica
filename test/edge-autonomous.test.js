"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawn}=require("node:child_process");
const {once}=require("node:events");
const {validateEdgeConfig}=require("../src/runtime/edge-config.js");
const {createAutonomousEdgeHost}=require("../src/runtime/autonomous-edge.js");
const TOKEN="test-operator-token-32-chars-minimum-secret";
const projectRoot=path.resolve(__dirname,"..");
const cli=path.join(projectRoot,"bin/pef-edge.js");
function config(dir,{workload=true,port=0}={}){
  return {schemaVersion:1,backend:"virtual-lab",
    identity:{siteId:"standalone-site",deviceId:"standalone-edge",configRevision:"r-1"},
    storageDir:dir,http:{host:"127.0.0.1",port},sampleIntervalMs:200,
    workload:{enabled:workload,reconcileMs:200},
    journal:{capacityBytes:65536,controlReserveBytes:4096},
    wan:{primary:{link:true,upstream:false},backup:{link:true,upstream:false}}};
}
async function temp(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-autonomous-"));
  try{return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const req=async(url,route,{method="GET",body,token=TOKEN,headers={}}={})=>{
  const response=await fetch(url+route,{method,headers:{
    ...(token?{"x-pef-token":token}:{}),...(body?{"content-type":"application/json"}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {http:response.status,...await response.json()};
};
test("T1 strict config rejects unprovisioned device, non-loopback, unsafe or surprising fields",()=>temp(async dir=>{
  const cfg=config(dir);
  assert.equal(validateEdgeConfig(cfg).backend,"virtual-lab");
  assert.throws(()=>validateEdgeConfig({...cfg,backend:"device"}),/INVALID_EDGE_CONFIG/);
  assert.throws(()=>validateEdgeConfig({...cfg,http:{host:"0.0.0.0",port:8888}}),/EDGE_LOOPBACK_ONLY/);
  assert.throws(()=>validateEdgeConfig({...cfg,extra:"execute-shell"}),/INVALID_EDGE_CONFIG/);
  assert.throws(()=>validateEdgeConfig({...cfg,storageDir:"/no/such/path"}),/INVALID_EDGE_STORAGE_DIR/);
  assert.throws(()=>validateEdgeConfig({...cfg,journal:{capacityBytes:250,controlReserveBytes:30}}),
    /INVALID_EDGE_JOURNAL_OPTIONS/);
}));
test("T1-T3 autonomous service owns shared Core without dashboard and persists journal across host restart",()=>temp(async dir=>{
  const cfg=config(dir),a=createAutonomousEdgeHost({config:cfg,token:TOKEN});
  const first=await a.listen();
  try{
    assert.equal((await req(first,"health",{token:null})).http,200);
    assert.equal((await req(first,"state",{token:null})).http,403);
    const initial=await req(first,"state");
    assert.equal(initial.backend,"virtual-lab");
    assert.equal(initial.dashboardRequired,false);
    assert.equal(initial.network.connectivity,"LOCAL_ONLY");
    assert.equal(initial.workloads[0].state,"RUNNING");
    assert.equal(initial.workloads[0].actualLimitsEnforced,false);
    assert.equal(initial.transportProvisioned,false);
    const received=await req(first,"workloads/receipts",{
      method:"POST",body:{receiptId:"T1",packageId:"BOX-T1"}});
    assert.equal(received.http,201);
    assert.equal(received.fsyncCompleted,true);
    assert.equal((await req(first,"workloads/receipts",{
      method:"POST",body:{receiptId:"T1",packageId:"BOX-T1"}})).http,200);
    assert.equal((await req(first,"receipts",{
      method:"POST",body:{receiptId:"T1",packageId:"DIFFERENT"}})).http,409);
    assert.equal((await req(first,"lab/wan",{method:"POST",
      body:{id:"primary",upstream:true}})).http,200);
    assert.equal((await req(first,"lab/sample",{method:"POST",body:{}})).http,200);
    const online=await req(first,"state");
    assert.equal(online.network.selectedWan,"primary");
    assert.equal(online.receipts[0].cloudAcked,false);
    assert.equal((await req(first,"ready")).http,200);
    assert.ok(online.sampleCount>=2);
    assert.throws(()=>createAutonomousEdgeHost({config:cfg,token:TOKEN}),/EDGE_ALREADY_RUNNING/);
  }finally{await a.close();}
  assert.equal(fs.existsSync(path.join(dir,"pef-edge-owner.json")),false);
  const second=createAutonomousEdgeHost({config:cfg,token:TOKEN});
  const newURL=await second.listen();
  try{
    const state=await req(newURL,"state");
    assert.equal(state.receipts.length,1);
    assert.equal(state.receipts[0].receiptId,"T1");
    assert.equal(state.receipts[0].cloudAcked,false);
    assert.equal(state.network.connectivity,"LOCAL_ONLY");
    assert.equal((await req(newURL,"receipts",{method:"POST",
      body:{receiptId:"T1",packageId:"BOX-T1"}})).duplicate,true);
  }finally{await second.close();}
}));
test("T2 immutable lab identity causes fail-closed config revision mismatch",()=>temp(async dir=>{
  const a=createAutonomousEdgeHost({config:config(dir,{workload:false}),token:TOKEN});
  await a.listen();await a.close();
  const updated=config(dir,{workload:false});
  updated.identity.configRevision="r-2";
  const another=createAutonomousEdgeHost({config:updated,token:TOKEN});
  await assert.rejects(()=>another.listen(),/LAB_BOOT_IDENTITY_CONFLICT/);
  assert.equal(fs.existsSync(path.join(dir,"pef-edge-owner.json")),false);
}));
async function spawnDaemon(configFile){
  const child=spawn(process.execPath,[cli,"--config",configFile],{
    cwd:projectRoot,env:{...process.env,PEF_EDGE_TOKEN:TOKEN},
    stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="",ready=null;
  child.stdout.on("data",part=>{
    stdout+=part.toString();
    for(const line of stdout.split("\n")){
      try{const obj=JSON.parse(line);if(obj.kind==="PEF_EDGE_READY")ready=obj;}catch{}
    }
  });
  child.stderr.on("data",part=>{stderr+=part.toString();});
  const start=Date.now();
  while(!ready&&child.exitCode===null&&Date.now()-start<6500)
    await new Promise(resolve=>setTimeout(resolve,35));
  if(!ready){
    child.kill("SIGKILL");
    await once(child,"exit").catch(()=>{});
    throw Error("DAEMON_START_FAILED:"+stderr+" stdout="+stdout);
  }
  return {child,ready};
}
test("T4 OS SIGKILL of daemon reclaims stale ownership and replays durable P1 after new epoch",()=>temp(async dir=>{
  const cfg=config(dir,{workload:false}),file=path.join(dir,"config.json");
  fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});
  const one=await spawnDaemon(file);
  let originalSession;
  try{
    const snapshot=await req(one.ready.url,"state");
    originalSession=snapshot.identity.sessionId;
    const receipt=await req(one.ready.url,"receipts",{
      method:"POST",body:{receiptId:"POWER-REC",packageId:"BOX-POWER"}});
    assert.equal(receipt.http,201);
    assert.equal(receipt.fsyncCompleted,true);
    const locked=await req(one.ready.url,"state");
    assert.equal(locked.receipts.length,1);
  }finally{one.child.kill("SIGKILL");await once(one.child,"exit");}
  const two=await spawnDaemon(file);
  try{
    const after=await req(two.ready.url,"state");
    assert.notEqual(after.identity.sessionId,originalSession);
    assert.equal(after.receipts.length,1);
    assert.equal(after.receipts[0].packageId,"BOX-POWER");
    assert.equal(after.storage.pending,3); // first/second session WAN transitions + business receipt
    assert.equal((await req(two.ready.url,"receipts",{
      method:"POST",body:{receiptId:"POWER-REC",packageId:"BOX-POWER"}})).http,200);
    assert.equal(after.dashboardRequired,false);
  }finally{
    two.child.kill("SIGTERM");await once(two.child,"exit");
  }
  assert.equal(fs.existsSync(path.join(dir,"pef-edge-owner.json")),false);
}));
