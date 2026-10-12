"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {createSession}=require("../src/emulator/session.js");
const {statechart}=require("../src/emulator/statechart.js");
test("independent state regions preserve healthy Core during complete WAN loss",()=>{
  const s=createSession();
  s.enqueue({action:"set_wan",id:"primary",upstream:false});s.next();
  s.enqueue({action:"set_wan",id:"backup",upstream:false});s.next();
  s.enqueue({action:"tick",seconds:1});s.next();
  const c=s.snapshot().chart;
  assert.equal(c.type,"parallel");
  assert.equal(c.regions.core.state,"HEALTHY");
  assert.equal(c.regions.connectivity.state,"LOCAL_ONLY");
  assert.equal(c.regions.cloud.state,"CLOUD_DISCONNECTED");
});
test("scenario steps can be rewound and replayed deterministically",()=>{
  const file=path.resolve(__dirname,"../scenarios/wan-offline.json");
  const spec=JSON.parse(fs.readFileSync(file,"utf8"));
  const s=createSession(spec),out=s.run();
  assert.equal(out.ok,true);
  const final=out.output;
  s.rewind(3);
  assert.equal(s.snapshot().cursor,3);
  assert.equal(s.run().ok,true);
  assert.deepEqual(s.snapshot(),final);
});
test("step oracle errors halt execution with inspectable history",()=>{
  const s=createSession({scenario_id:"negative",steps:[
    {action:"set_cloud",available:false},
    {action:"assert",path:"cloud",equals:"ONLINE"},
    {action:"tick",seconds:1}
  ]});
  s.next();const error=s.next();
  assert.equal(error.ok,false);assert.equal(error.error,"ASSERTION_FAILED");
  assert.equal(s.snapshot().halted,true);assert.equal(s.snapshot().cursor,2);
  assert.equal(s.next().error,"HALTED_REWIND_OR_RESET");
  s.rewind(1);
  assert.equal(s.snapshot().halted,false);
  assert.equal(s.snapshot().cursor,1);
});
test("rewound interactive timeline branches and truncates future steps",()=>{
  const s=createSession({scenario_id:"custom",steps:[
    {action:"set_cloud",available:false},{action:"tick",seconds:1}
  ]});
  s.run();s.rewind(1);
  s.enqueue({action:"set_cloud",available:true});
  assert.equal(s.snapshot().totalSteps,2);
  assert.equal(s.next().ok,true);
  assert.equal(s.snapshot().state.cloud,"ONLINE");
});
test("non-simulation backends and unsupported actions are rejected",()=>{
  assert.throws(()=>createSession({scenario_id:"bad",backend:"device",steps:[]}),/INVALID_SIM_SCENARIO/);
  const s=createSession();
  assert.throws(()=>s.enqueue({action:"shell",command:"danger"}),/UNSUPPORTED_SIM_ACTION/);
  assert.throws(()=>s.enqueue({action:"assert",path:"health"}),/INVALID_ASSERTION/);
  assert.throws(()=>s.rewind(2),/INVALID_CURSOR/);
});
test("projection does not modify original simulator observable state",()=>{
  const s=createSession();
  const before=s.snapshot().state,copy=JSON.stringify(before);
  statechart(before);
  assert.equal(JSON.stringify(before),copy);
});
