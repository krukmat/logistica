#!/usr/bin/env node
"use strict";
// Privileged probe/route adapter. Opt-in ONLY on GitHub-hosted ephemeral runners.
// Every route and address mutation targets a matching PEF test namespace.
const {execFileSync}=require("node:child_process");
const fs=require("node:fs");
const path=require("node:path");
const {createConnectivityController}=require("../../src/emulator/lab/netns-policy.js");
function need(name){if(!process.env[name])throw Error("LAB_BLOCKED:"+name);return process.env[name];}
function ip(...args){return execFileSync("ip",args,{encoding:"utf8",timeout:5000}).trim();}
if(process.platform!=="linux"||process.getuid?.()!==0||
    process.env.PEF_NETNS_ACK!=="GITHUB_HOSTED_EPHEMERAL_ONLY"||
    process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
    process.env.RUNNER_ENVIRONMENT!=="github-hosted")throw Error("LAB_BLOCKED:hosted-root-only");
const ns={edge:need("PEF_NETNS_EDGE"),lan:need("PEF_NETNS_LAN"),wa:need("PEF_NETNS_WA"),wb:need("PEF_NETNS_WB")};
const match=ns.edge.match(/^pef-(\d{5}-\d+)-edge$/);
if(!match||ns.lan!==`pef-${match[1]}-lan`||ns.wa!==`pef-${match[1]}-wan-a`||ns.wb!==`pef-${match[1]}-wan-b`)throw Error("LAB_BLOCKED:namespace-mismatch");
const root=need("PEF_NETNS_REPO_ROOT");
const probeScript=path.join(root,"scripts/lab/netns-probe.py");
const clientScript=path.join(root,"scripts/lab/netns-client.py");
if(!fs.statSync(probeScript).isFile()||!fs.statSync(clientScript).isFile())throw Error("LAB_BLOCKED:missing-lab-script");
const gw={primary:["10.250.20.1","wa0"],backup:["10.250.30.1","wb0"]};
function defaultRoute(){return ip("-n",ns.edge,"route","show","default");}
function checkRoute(selected){
  const value=defaultRoute();
  if(selected===null){if(value!=="")throw Error("UNEXPECTED_DEFAULT_ROUTE:"+value);}
  else if(!value.includes("via "+gw[selected][0])||!value.includes("dev "+gw[selected][1]))throw Error("ROUTE_DIVERGENCE:"+value);
  return value;
}
async function applyRoute(selected){
  if(selected===null){
    if(defaultRoute())ip("-n",ns.edge,"route","del","default");
  }else{
    ip("-n",ns.edge,"route","replace","default","via",gw[selected][0],"dev",gw[selected][1]);
  }
  checkRoute(selected);
}
async function probeWan(id){
  const linkDescription=ip("-o","-n",ns.edge,"link","show","dev",gw[id][1]);
  const link=/\bstate UP\b/.test(linkDescription);
  if(!link)return {link:false,upstream:false,reason:"L2_DOWN"};
  const probeResult=ip("netns","exec",ns.edge,"python3",probeScript,id);
  if(!["UP","DOWN"].includes(probeResult))throw Error("BAD_WAN_PROBE:"+probeResult);
  return {link:true,upstream:probeResult==="UP",reason:probeResult==="UP"?"HEALTHY":"UPSTREAM_UNREACHABLE"};
}
function client(expect){
  return ip("netns","exec",ns.lan,"python3",clientScript,expect);
}
const ctrl=createConnectivityController({probe:probeWan,applyRoute,simulatorOptions:{failbackHoldSeconds:5}});
const assertions=[],failures=[];
function assertLab(id,valid,details){
  assertions.push({id,ok:!!valid,details});
  if(!valid)throw Error("ORACLE_FAILED:"+id);
}
async function phase(id,seconds,expectedWan,expectedResponse){
  const observed=await ctrl.sample(seconds);
  assertLab(id,observed.selectedWan===expectedWan&&observed.routeApplied&&observed.health==="HEALTHY",{
    selected:observed.selectedWan,connectivity:observed.connectivity,clock:observed.logicalTime,probes:observed.probes,route:checkRoute(expectedWan)});
  if(expectedResponse){
    const response=client(expectedResponse);
    assertLab(id+"-client",response.includes("OBSERVED_"+expectedResponse),response);
  }
}
async function run(){
  let aLost=false,bLost=false;
  try{
    await phase("initial",1,"primary","WAN_A");
    ip("-n",ns.wa,"addr","del","10.250.20.1/24","dev","eth0");aLost=true;
    assertLab("carrier-up-while-upstream-unreachable",/\bstate UP\b/.test(ip("-o","-n",ns.edge,"link","show","dev","wa0")),null);
    await phase("primary-unreachable",1,"backup","WAN_B");
    ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");aLost=false;
    await phase("failback-hold",1,"backup","WAN_B");
    await phase("failback-stable",5,"primary","WAN_A");
    ip("-n",ns.wa,"addr","del","10.250.20.1/24","dev","eth0");aLost=true;
    ip("-n",ns.wb,"addr","del","10.250.30.1/24","dev","eth0");bLost=true;
    await phase("all-wan-unreachable",1,null,"DOWN");
    const ping=ip("netns","exec",ns.lan,"ping","-q","-c","1","-W","1","10.250.10.1");
    assertLab("local-lan-remains-operational",/\b0% packet loss\b/.test(ping),ping);
    ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");aLost=false;
    await phase("restored",1,"primary","WAN_A");
  }catch(err){failures.push(String(err.stack||err));}
  finally{
    try{
      if(aLost)ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");
      if(bLost)ip("-n",ns.wb,"addr","add","10.250.30.1/24","dev","eth0");
      await applyRoute("primary");
    }catch(err){failures.push("RESTORE_FAILED:"+String(err.stack||err));}
  }
  const evidence={kind:"PEF_NETNS_POLICY_LAB",status:failures.length?"LAB_FAIL":"LAB_PASS",
    scope:"real Linux veth peer HTTP probes and isolated route table; logical decision model",
    physicalWanValidated:false,hardwareValidated:false,latencyPercentilesValidated:false,
    assertions,failures,observations:ctrl.observations(),simulatorTrace:ctrl.trace(),
    limitations:["No physical WAN or NAT/firewall throughput","Failback seconds are logical ticks, not measured p95","Only isolated test namespace routes modified"]};
  if(process.env.PEF_NETNS_POLICY_EVIDENCE)fs.writeFileSync(process.env.PEF_NETNS_POLICY_EVIDENCE,JSON.stringify(evidence,null,2)+"\n");
  process.stdout.write(JSON.stringify({kind:evidence.kind,status:evidence.status,assertions,failures})+"\n");
  if(failures.length)process.exitCode=1;
}
run().catch(e=>{console.error("LAB_FAIL",String(e));process.exitCode=1;});
