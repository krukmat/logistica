"use strict";
const {execFileSync}=require("node:child_process");
const {createArm64VmNetnsPorts}=require("../../src/adapters/arm64-vm-netns-ports.js");
const {createVerifiedRoutePorts}=require("../../src/adapters/verified-route-ports.js");
const {createConnectivityController}=require("../../src/core/connectivity-controller.js");
(async()=>{
 const ns={edge:process.env.PEF_VM_EDGE,a:process.env.PEF_VM_WANA,b:process.env.PEF_VM_WANB};
 const raw=createArm64VmNetnsPorts(ns),verified=createVerifiedRoutePorts(raw);
 const core=createConnectivityController({probe:verified.probe,applyRoute:verified.applyRoute});
 const steps=[];
 async function check(label){
   await core.sample(1);
   const selected=core.status().selectedWan,readback=await raw.readRoute();
   if(selected!==readback)throw Error("VM_CORE_ROUTE_DIVERGED:"+label);
   steps.push({step:label,selectedWan:selected,routeReadback:readback});
 }
 const set=(nsName,value)=>execFileSync("ip",["-n",nsName,"link","set","eth0",value],{timeout:3500});
 await check("primary");
 set(ns.a,"down");await check("backup");
 set(ns.b,"down");await check("all-wan-down");
 set(ns.a,"up");await check("primary-return");
 if(JSON.stringify(steps.map(x=>x.selectedWan))!==JSON.stringify(["primary","backup",null,"primary"]))
   throw Error("VM_NETNS_WRONG_FAILOVER");
 console.log(JSON.stringify({kind:"PEF_ARM64_VM_NETNS_CORE",status:"VM_NETNS_LAB_PASS",ok:true,steps,
   virtualInterfaces:3,nativeCandidateEthernetPorts:2,hostRoutesChanged:false,physicalValidated:false}));
})().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
