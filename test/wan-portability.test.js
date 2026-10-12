"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createSimulator}=require("../src/emulator/core.js");
const {createConnectivityController}=require("../src/emulator/lab/netns-policy.js");
const {evaluateWanPolicy}=require("../src/core/wan-policy.js");
function config(){return {failbackHoldSeconds:3};}
test("portable WAN policy has zero IO dependencies and deterministic immutable inputs",()=>{
  const wans=[
    {id:"primary",priority:1,link:true,upstream:false,healthySince:null},
    {id:"backup",priority:2,link:true,upstream:true,healthySince:0}
  ];
  const before=JSON.stringify(wans);
  const next=evaluateWanPolicy({wans,selectedWan:"primary",clock:4,failbackHoldSeconds:3});
  assert.equal(JSON.stringify(wans),before);
  assert.equal(next.selectedWan,"backup");
  assert.equal(next.connectivity,"CONNECTED");
  assert.throws(()=>evaluateWanPolicy({wans:[{id:"a",priority:1,link:"yes",upstream:true}],clock:1}),/INVALID_WAN_POLICY_INPUT/);
});
test("simulator and adapter-controlled runtime share EXACT WAN policy for 128 transition vectors",async()=>{
  const simulator=createSimulator(config()),source={
    primary:{link:true,upstream:true},
    backup:{link:true,upstream:true}};
  const selected=[];
  const controller=createConnectivityController({
    probe:async id=>({...source[id],reason:"PORTABILITY_CONTRACT"}),
    applyRoute:async id=>{selected.push(id);},
    simulatorOptions:config()
  });
  for(let i=0;i<128;i++){
    const p=i%8, b=Math.floor(i/8)%8;
    source.primary.link=(p&1)!==0;
    source.primary.upstream=(p&2)!==0;
    source.backup.link=(b&1)!==0;
    source.backup.upstream=(b&2)!==0;
    const seconds=i%5===0?5:1;
    for(const id of ["primary","backup"])
      simulator.act("set_wan",{id,...source[id]});
    simulator.act("tick",{seconds});
    const observed=await controller.sample(seconds),sim=simulator.status(),adapter=controller.status();
    assert.equal(observed.selectedWan,sim.selectedWan,"vector "+i+" WAN");
    assert.equal(observed.connectivity,sim.connectivity,"vector "+i+" mode");
    assert.equal(observed.logicalTime,sim.clock,"vector "+i+" clock");
    assert.equal(adapter.selectedWan,sim.selectedWan,"vector "+i+" controller state");
    assert.equal(adapter.health,sim.health,"vector "+i+" health");
    assert.deepEqual(observed.probes.map(x=>({id:x.wan,link:x.link,upstream:x.upstream})),
      sim.wans.map(x=>({id:x.id,link:x.link,upstream:x.upstream})));
  }
  assert.equal(selected.length,128);
  assert.equal(controller.observations().length,128);
});
test("Linux-style failed route writer MUST NOT report a committed route decision",async()=>{
  let fail=false,seen=[];
  const controller=createConnectivityController({
    probe:async()=>({link:true,upstream:true}),
    applyRoute:async id=>{seen.push(id);if(fail)throw Error("ADAPTER_ROUTE_FAILED");},
    simulatorOptions:config()
  });
  await controller.sample(1);
  const before=controller.status(),count=controller.observations().length;
  fail=true;
  await assert.rejects(()=>controller.sample(1),/ADAPTER_ROUTE_FAILED/);
  assert.deepEqual(controller.status(),before);
  assert.equal(controller.observations().length,count);
  assert.equal(seen.length,2);
});
