"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const bom=require("../docs/contracts/pef-r28s-f3-single-unit-bom-v1.json");
const {validate,observeRouter}=require("../src/runtime/external-router-observer.js");
test("F3 BOM is new-only, one-unit quotation unknown, does not invent PSU price or USB NIC",()=>{
 assert.equal(bom.quantity,1);
 assert.equal(bom.scenarios[0].listedComponentsUsd,35.99);
 assert.equal(bom.scenarios[1].listedComponentsUsd,44.99);
 assert.equal(bom.scenarios[1].deliveredTotalUsd,null);
 assert.equal(bom.required.find(x=>x.item.startsWith("Power")).priceUsd,null);
 assert.equal(bom.portInventory.nativeGigabitEthernet,2);
 assert.equal(bom.acceptance.procurementApproved,false);
});
test("F3 accepts recent read-only router observation without granting WAN ownership to PEF",async()=>{
 const sample={kind:"PEF_EXTERNAL_ROUTER_STATUS_V1",wanOwner:"EXTERNAL_ROUTER",
  routerId:"router-01",observedAtMs:100000,selectedWan:"backup",
  uplinks:{primary:{link:true,upstream:false},backup:{link:true,upstream:true}}};
 const r=await observeRouter({getStatus:async()=>sample},{nowMs:101000});
 assert.equal(r.ok,true);assert.equal(r.selectedWan,"backup");
 assert.equal(r.wanControlledByPEF,false);assert.equal(r.hostRoutesChanged,false);
 assert.equal(validate({...sample,observedAtMs:0},{nowMs:101000}).ok,false);
 assert.equal(validate({...sample,selectedWan:"primary"},{nowMs:101000}).ok,false);
});
test("F3 rejects writer-shaped connectors and status claiming invented PEF route switching",async()=>{
 await assert.rejects(observeRouter({getStatus:async()=>({}),applyRoute:async()=>{}}),
  /ROUTER_ONLY_READONLY_GETSTATUS_ALLOWED/);
 assert.equal(validate({kind:"PEF_EXTERNAL_ROUTER_STATUS_V1",wanOwner:"PEF"},{}).ok,false);
});
