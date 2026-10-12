"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createDashboardServer}=require("../src/emulator/dashboard-server.js");
async function withPanel(fn){
  const app=createDashboardServer({port:0}),url=await app.listen();
  try{
    const boot=await (await fetch(url+"api/bootstrap")).json();
    const call=async body=>{
      const res=await fetch(url+"api/command",{method:"POST",headers:{
        "content-type":"application/json","x-pef-session":boot.token},body:JSON.stringify(body)});
      return {httpStatus:res.status,...await res.json()};
    };
    return await fn({url,boot,call});
  }finally{await app.close();}
}
test("dashboard renders integrated mode and executes same fsync journal as Edge Runtime",()=>withPanel(async({url,boot,call})=>{
  const html=await (await fetch(url)).text();
  assert.match(html,/id="mode-lab"/);
  assert.match(html,/id="lab-restart"/);
  assert.match(html,/id="lab-pending"/);
  assert.equal(boot.mode,"sim");
  assert.equal((await call({command:"lab",action:"sample"})).httpStatus,400);
  const selected=await call({command:"mode",mode:"lab"});
  assert.equal(selected.mode,"lab");
  assert.equal(selected.lab.identity.deviceId,"demo-edge");
  assert.equal(selected.lab.identity.configRevision,"cfg-demo-1");
  assert.equal(selected.lab.physicalValidated,false);
  const first=await call({command:"lab",action:"sample"});
  assert.equal(first.result.event.ack,true);
  assert.equal(first.result.event.fsyncCompleted,true);
  assert.equal(first.lab.storage.pending,1);
  const back=await call({command:"lab",action:"wan",id:"primary",upstream:false});
  assert.equal(back.lab.network.selectedWan,"backup");
  assert.equal(back.result.event.ack,true);
  const offline=await call({command:"lab",action:"wan",id:"backup",upstream:false});
  assert.equal(offline.lab.network.connectivity,"LOCAL_ONLY");
  assert.equal(offline.lab.storage.pending,3);
  assert.equal((await call({command:"lab",action:"sync"})).result.error,"CLOUD_UNAVAILABLE");
  await call({command:"lab",action:"wan",id:"primary",upstream:true});
  const sync=await call({command:"lab",action:"sync"});
  assert.equal(sync.result.status,"SYNC_OK");
  assert.equal(sync.lab.storage.pending,0);
  assert.equal(sync.lab.cloud.stored,4);
  assert.equal((await call({command:"lab",action:"compact"})).result.ok,true);
}));
test("integrated mock cloud lost ACK and forged ACK remain pending until valid replay",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  const first=await call({command:"lab",action:"sample"});
  const session=first.lab.identity.sessionId;
  await call({command:"lab",action:"lostAck"});
  const lost=await call({command:"lab",action:"sync"});
  assert.equal(lost.result.error,"REMOTE_ACK_LOST");
  assert.equal(lost.lab.storage.pending,1);
  assert.equal(lost.lab.cloud.stored,1);
  const restart=await call({command:"lab",action:"restart"});
  assert.notEqual(restart.lab.identity.sessionId,session);
  assert.equal(restart.lab.storage.pending,1);
  await call({command:"lab",action:"forgedAck"});
  const forged=await call({command:"lab",action:"sync"});
  assert.equal(forged.result.error,"INVALID_REMOTE_ACK");
  assert.equal(forged.lab.storage.pending,1);
  const valid=await call({command:"lab",action:"sync"});
  assert.equal(valid.result.status,"SYNC_OK");
  assert.equal(valid.result.duplicates,1);
  assert.equal(valid.lab.storage.pending,0);
  const again=await call({command:"lab",action:"sample"});
  assert.notEqual(first.result.event.eventId,again.result.event.eventId);
}));
test("pressure profile displays unacknowledged P1 events without interrupting WAN",()=>withPanel(async({call})=>{
  await call({command:"mode",mode:"lab"});
  const reset=await call({command:"lab",action:"reset",profile:"pressure"});
  assert.equal(reset.lab.storage.capacityBytes,2400);
  await call({command:"lab",action:"sample"});
  await call({command:"lab",action:"wan",id:"primary",upstream:false});
  await call({command:"lab",action:"wan",id:"backup",upstream:false});
  const result=await call({command:"lab",action:"wan",id:"primary",upstream:true});
  assert.equal(result.lab.network.selectedWan,"primary");
  assert.equal(result.result.event.ack,false);
  assert.equal(result.lab.runtimeHealth,"DEGRADED");
  assert.ok(result.lab.volatilePending>0);
}));
