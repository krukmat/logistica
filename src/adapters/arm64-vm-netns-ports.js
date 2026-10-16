"use strict";
// Only inside dedicated virtual ARM64 Linux guest, never on developer's Mac or physical board.
const fs=require("node:fs");
const {execFileSync,spawnSync}=require("node:child_process");
function assertArm64VmNetns(ns){
 if(process.platform!=="linux"||process.arch!=="arm64"||process.getuid?.()!==0||
    process.env.PEF_ARM64_VM_ACK!=="R28S_GUEST_NETNS_ONLY"||!ns||
    !["edge","a","b"].every(id=>/^[a-z0-9-]{6,60}$/.test(ns[id]||"")))
    throw Error("ARM64_VM_NETNS_BLOCKED");
 const vm=spawnSync("systemd-detect-virt",["--vm"],{timeout:2000,encoding:"utf8"});
 if(vm.status!==0||!fs.existsSync("/proc/self/ns/net"))throw Error("ARM64_VM_NOT_VIRTUAL");
}
function createArm64VmNetnsPorts(ns){
 assertArm64VmNetns(ns);
 const ends={primary:{nic:"wa0",gw:"10.253.20.1"},backup:{nic:"wb0",gw:"10.253.30.1"}};
 const ip=(...x)=>execFileSync("ip",x,{encoding:"utf8",timeout:5000}).trim();
 const rawRoute=()=>ip("-n",ns.edge,"route","show","default");
 async function readRoute(){
   const r=rawRoute();if(!r)return null;
   for(const [id,p] of Object.entries(ends))
     if(r.includes("via "+p.gw)&&r.includes("dev "+p.nic))return id;
   throw Error("ARM64_VM_DEFAULT_ROUTE_UNKNOWN");
 }
 async function applyRoute(id){
   if(id!==null&&!Object.hasOwn(ends,id))throw Error("ARM64_VM_ROUTE_INVALID");
   if(id===null){if(rawRoute())ip("-n",ns.edge,"route","del","default");}
   else{const p=ends[id];ip("-n",ns.edge,"route","replace","default","via",p.gw,"dev",p.nic);}
   if((await readRoute())!==id)throw Error("ARM64_VM_ROUTE_NOT_APPLIED");
 }
 async function probe(id){
   if(!Object.hasOwn(ends,id))throw Error("ARM64_VM_PROBE_INVALID");
   const p=ends[id],link=/\bstate UP\b/.test(ip("-o","-n",ns.edge,"link","show","dev",p.nic));
   if(!link)return {link:false,upstream:false,reason:"VM_LINK_DOWN"};
   const ping=spawnSync("ip",["netns","exec",ns.edge,"ping","-n","-I",p.nic,"-c","1","-W","1",p.gw],
     {encoding:"utf8",timeout:2500});
   return {link:true,upstream:ping.status===0,reason:ping.status===0?"VM_GATEWAY_UP":"VM_GATEWAY_DOWN"};
 }
 return {probe,applyRoute,readRoute,scope:"VIRTUAL_GUEST_NETNS_ONLY",hardwareValidated:false};
}
module.exports={assertArm64VmNetns,createArm64VmNetnsPorts};
