"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createEdgeRuntime}=require("../src/core/edge-runtime.js");
const {createDashboardLab}=require("../src/emulator/dashboard-lab.js");
const {createDashboardServer}=require("../src/emulator/dashboard-server.js");
const {openRuntimeBackend}=require("../src/runtime/backend-registry.js");
const {eventChecksum}=require("../src/core/event-envelope.js");
const {syncJournal}=require("../src/core/cloud-sync.js");
const root=path.resolve(__dirname,"..");
const identity={siteId:"test-site",deviceId:"test-edge",configRevision:"r1"};
function fakeJournal({durable=true}={}){
  const data=new Map(),confirmed=new Set();
  const signed=(event)=>({...event,sha256:eventChecksum(event)});
  return {
    append(e){
      if(data.has(e.eventId))return {ack:true,duplicate:true,fsyncCompleted:true};
      if(!durable)return {ack:true,fsyncCompleted:false};
      data.set(e.eventId,signed(e));return {ack:true,fsyncCompleted:true};
    },
    retained:()=>[...data.values()].map(e=>({...e,cloudAcked:confirmed.has(e.eventId)})),
    pending:()=>[...data.values()].filter(e=>!confirmed.has(e.eventId)),
    cloudAck:(id)=>{confirmed.add(id);return {ack:true,fsyncCompleted:durable};},
    compact:()=>({ok:true}),
    status:()=>({unsafe:!durable,pending:data.size-confirmed.size,events:data.size})
  };
}
test("product Core has no imports of simulator, dashboard, filesystem or child processes",()=>{
  const core=path.join(root,"src/core");
  const files=fs.readdirSync(core).filter(x=>x.endsWith(".js"));
  assert.ok(files.length>=5);
  for(const file of files){
    const source=fs.readFileSync(path.join(core,file),"utf8");
    assert.doesNotMatch(source,/require\(["'](?:\.\.\/emulator|node:fs|node:child_process)/,
      "nonportable product dependency in "+file);
    assert.doesNotMatch(source,/execFileSync\s*\(/,"Core shell call in "+file);
  }
});
test("Core accepts a non-filesystem journal through the identical port contracts",async()=>{
  const journal=fakeJournal();
  const ports={probe:async id=>({link:true,upstream:id==="primary"}),applyRoute:async()=>{}};
  const core=createEdgeRuntime({journal,identity,sessionId:"mem-epoch",...ports});
  try{
    const sampled=await core.sample(1);
    assert.equal(sampled.observed.selectedWan,"primary");
    assert.equal(sampled.event.ack,true);
    const receipt=core.receivePackage({receiptId:"R-100",packageId:"BOX-100"});
    assert.equal(receipt.accepted,true);
    assert.equal(receipt.fsyncCompleted,true);
    assert.equal(core.listReceipts().length,1);
  }finally{core.close();}
});
test("false journal ACK without fsync is rejected by business acceptance, WAN event and cloud cursor",async()=>{
  const journal=fakeJournal({durable:false});
  const core=createEdgeRuntime({journal,identity,sessionId:"unsafe-epoch",
    probe:async()=>({link:true,upstream:true}),applyRoute:async()=>{}});
  try{
    const offline=core.receivePackage({receiptId:"R-101",packageId:"BOX-101"});
    assert.equal(offline.accepted,false);
    assert.equal(offline.error,"JOURNAL_DURABILITY_UNCONFIRMED");
    const sample=await core.sample(1);
    assert.equal(sample.event.ack,false);
    assert.equal(sample.runtimeHealth,"DEGRADED");
    const item={eventId:"test-event",category:"O1",payload:{siteId:"test-site",deviceId:"test-edge"}};
    item.sha256=eventChecksum(item);
    const fake={
      pending:()=>[item],
      cloudAck:()=>({ack:true,fsyncCompleted:false})
    };
    const ack=await syncJournal({journal:fake,transport:{ingest:async()=>({
      ok:true,durable:true,eventId:item.eventId,sha256:item.sha256,
      siteId:"test-site",deviceId:"test-edge",duplicate:false
    })}});
    assert.equal(ack.error,"LOCAL_CURSOR_NOT_DURABLE");
    assert.equal(ack.acked,0);
  }finally{core.close();}
});
test("backend registry refuses physical device and unprovisioned runtime; virtual ports run Core",async()=>{
  assert.equal(openRuntimeBackend("device",{}).error,"BACKEND_NOT_IMPLEMENTED");
  assert.equal(openRuntimeBackend("typo",{}).error,"UNKNOWN_BACKEND");
  assert.equal(openRuntimeBackend("virtual-lab",{identity}).error,"INVALID_SERVICE_PORTS");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-runtime-backend-"));
  try{
    const r=openRuntimeBackend("virtual-lab",{dir,identity,sessionId:"backend-epoch",
      ports:{probe:async id=>({link:true,upstream:id==="primary"}),applyRoute:async()=>{}}});
    assert.equal(r.ok,true,JSON.stringify(r));
    assert.equal(r.capabilities.physical,false);
    assert.equal((await r.engine.sample(1)).observed.selectedWan,"primary");
    r.engine.close();
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("dashboard can be restarted independently without closing injected runtime or losing local operations",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"pef-ui-lifecycle-"));
  const runtimeLab=createDashboardLab({tmpParent:folder});
  const open=async()=>{const server=createDashboardServer({port:0,runtimeLab});
    return {server,url:await server.listen()};};
  try{
    const first=await open(),bootstrap=await (await fetch(first.url+"api/bootstrap")).json();
    const request=async(url,token,body)=>fetch(url+"api/command",{method:"POST",
      headers:{"content-type":"application/json","x-pef-session":token},body:JSON.stringify(body)});
    await request(first.url,bootstrap.token,{command:"mode",mode:"lab"});
    const posted=await fetch(first.url+"api/local/receipts",{method:"POST",
      headers:{"content-type":"application/json","x-pef-session":bootstrap.token},
      body:JSON.stringify({receiptId:"UI-R1",packageId:"UI-P1"})});
    assert.equal(posted.status,201);
    const event=runtimeLab.listReceipts()[0].eventId;
    await first.server.close();
    assert.equal(runtimeLab.listReceipts()[0].eventId,event);
    const second=await open(),next=await (await fetch(second.url+"api/bootstrap")).json();
    try{
      await request(second.url,next.token,{command:"mode",mode:"lab"});
      const state=await fetch(second.url+"api/local/receipts",{headers:{"x-pef-session":next.token}});
      const data=await state.json();
      assert.equal(data.receipts.length,1);
      assert.equal(data.receipts[0].eventId,event);
    }finally{await second.server.close();}
    assert.equal(runtimeLab.listReceipts().length,1);
  }finally{runtimeLab.close();assert.deepEqual(fs.readdirSync(folder),[]);
    fs.rmSync(folder,{recursive:true,force:true});}
});
