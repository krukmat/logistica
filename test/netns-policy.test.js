"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createConnectivityController}=require("../src/emulator/lab/netns-policy.js");
test("observed WAN probes decide route with failback hysteresis without host commands",async()=>{
  const health={primary:{link:true,upstream:true},backup:{link:true,upstream:true}};
  const routes=[];
  const ctrl=createConnectivityController({probe:async(id)=>health[id],applyRoute:async(id)=>routes.push(id),simulatorOptions:{failbackHoldSeconds:5}});
  assert.equal((await ctrl.sample()).selectedWan,"primary");
  health.primary={link:true,upstream:false};
  assert.equal((await ctrl.sample()).selectedWan,"backup");
  health.primary={link:true,upstream:true};
  assert.equal((await ctrl.sample(1)).selectedWan,"backup");
  assert.equal((await ctrl.sample(5)).selectedWan,"primary");
  health.primary={link:false,upstream:false};health.backup={link:false,upstream:false};
  const down=await ctrl.sample(1);
  assert.equal(down.selectedWan,null);assert.equal(down.connectivity,"LOCAL_ONLY");assert.equal(down.health,"HEALTHY");
  assert.deepEqual(routes,["primary","backup","backup","primary",null]);
});
test("controller rejects malformed probe data without applying routing",async()=>{
  const routes=[];
  const ctrl=createConnectivityController({probe:async()=>({link:"yes",upstream:true}),applyRoute:async(x)=>routes.push(x)});
  await assert.rejects(()=>ctrl.sample(),/INVALID_WAN_PROBE/);
  assert.deepEqual(routes,[]);
});
test("unavailable route writer is not silently treated as applied",async()=>{
  const ctrl=createConnectivityController({probe:async()=>({link:true,upstream:true}),applyRoute:async()=>{throw Error("ROUTE_APPLY_FAILED");}});
  await assert.rejects(()=>ctrl.sample(),/ROUTE_APPLY_FAILED/);
  assert.equal(ctrl.observations().length,0);
});
