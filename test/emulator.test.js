"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {createSimulator}=require("../src/emulator/core.js");
const {runScenario}=require("../src/emulator/scenario.js");
const folder=path.resolve(__dirname,"../scenarios");
test("all scenario fixtures pass in virtual model but do not certify real hardware",()=>{
  const names=fs.readdirSync(folder).filter(n=>n.endsWith(".json")).sort();
  assert.ok(names.length>=6);
  for(const name of names){
    const result=runScenario(JSON.parse(fs.readFileSync(path.join(folder,name),"utf8")));
    assert.equal(result.status,"SIM_PASS",name+": "+JSON.stringify(result.issues));
    assert.equal(result.hardware_validated,false);
    assert.equal(result.physical_storage_validated,false);
  }
});
test("WAN blackhole causes failover, all WAN down still yields HEALTHY local-only",()=>{
  const sim=createSimulator();sim.act("set_wan",{id:"primary",upstream:false});sim.act("tick",{seconds:1});
  assert.equal(sim.status().selectedWan,"backup");
  sim.act("set_wan",{id:"backup",upstream:false});sim.act("tick",{seconds:1});
  assert.equal(sim.status().health,"HEALTHY");assert.equal(sim.status().connectivity,"LOCAL_ONLY");
});
test("power-cut simulation loses unacknowledged preparation but retains committed events",()=>{
  const sim=createSimulator();assert.equal(sim.act("append",{eventId:"a",payload:{v:1}}).ack,true);
  sim.act("prepare_append",{eventId:"b"});sim.act("power_cut");
  assert.deepEqual(sim.getCommitted().map(e=>e.id),["a"]);
});
test("uncertain cloud ACK replays idempotently",()=>{
  const sim=createSimulator();sim.act("append",{eventId:"idempotent",payload:{v:2}});
  assert.equal(sim.act("sync",{dropLocalAck:true}).uploaded,1);
  assert.equal(sim.act("sync").duplicates,1);assert.equal(sim.status().pendingEvents,0);
});
test("memory admission, privilege escalation, quota and crash loops enforced by virtual model",()=>{
  const m=JSON.parse(fs.readFileSync(path.join(folder,"workload-isolation.json"),"utf8")).steps[0].manifest;
  const sim=createSimulator({p2CapacityBytes:4*1048576});
  assert.equal(sim.act("admit",{manifest:{...m,resources:{...m.resources,memory_request_mib:10000,memory_limit_mib:10000}}}).error,"INSUFFICIENT_MEMORY");
  assert.equal(sim.act("admit",{manifest:{...m,network_intents:[{kind:"raw_firewall"}]}}).error,"NETWORK_INTENT_DENIED");
  assert.equal(sim.act("admit",{manifest:m}).ok,true);
  for(let i=0;i<4;i++)sim.act("crash_workload",{id:"automation"});
  assert.equal(sim.status().workloads.automation.status,"ISOLATED");
  assert.equal(sim.act("write_workload",{id:"automation",bytes:1}).error,"WORKLOAD_NOT_RUNNING");
});
test("runner rejects unknown actions and failed assertions",()=>{
  assert.equal(runScenario({scenario_id:"EMU-INVALID",steps:[{action:"unknown"}]}).status,"SIM_FAIL");
  assert.equal(runScenario({scenario_id:"EMU-ASSERT",steps:[{action:"assert",path:"health",equals:"CRITICAL"}]}).status,"SIM_FAIL");
});

test("same event ID with different payload rejects conflicting ACK including after cloud sync",()=>{
  const sim=createSimulator();
  assert.equal(sim.act("append",{eventId:"key",payload:{a:1}}).ack,true);
  assert.equal(sim.act("append",{eventId:"key",payload:{a:2}}).error,"EVENT_ID_CONFLICT");
  assert.equal(sim.act("sync").uploaded,1);
  assert.equal(sim.act("append",{eventId:"key",payload:{a:2}}).ack,false);
  assert.equal(sim.act("append",{eventId:"key",payload:{a:1}}).duplicate,true);
});
test("missing manifest version cannot be admitted",()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(folder,"workload-isolation.json"),"utf8"));
  const m=fixture.steps[0].manifest,{manifest_version,...withoutVersion}=m;
  const sim=createSimulator({p2CapacityBytes:4*1048576});
  assert.equal(sim.act("admit",{manifest:withoutVersion}).error,"INVALID_MANIFEST");
});

test("backend negotiation rejects unimplemented lab/device drivers without touching host",()=>{
  const unknown=runScenario({scenario_id:"EMU-BACKEND-UNKNOWN",backend:"other",steps:[]});
  assert.equal(unknown.status,"SIM_FAIL");
  assert.equal(unknown.issues[0].error,"UNKNOWN_BACKEND");
  const lab=runScenario({scenario_id:"EMU-BACKEND-LINUX",backend:"linux-lab",steps:[{action:"tick",seconds:1}]});
  assert.equal(lab.status,"SIM_BLOCKED");
  assert.equal(lab.issues[0].error,"BACKEND_NOT_IMPLEMENTED");
  assert.equal(lab.steps.length,0);
  assert.equal(lab.hardware_validated,false);
  const physical=runScenario({scenario_id:"EMU-BACKEND-DEVICE",backend:"device",steps:[]});
  assert.equal(physical.status,"SIM_BLOCKED");
});
