"use strict";
// Only executes inside the explicitly authorized, ephemeral GitHub-hosted namespace test.
// Never invoke on a developer workstation or a physical device.
const {execFileSync}=require("node:child_process");
const fs=require("node:fs"),path=require("node:path");
function assertHostedLinuxLab({ns,repoRoot}={}){
  if(process.platform!=="linux"||process.getuid?.()!==0||
     process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
     process.env.RUNNER_ENVIRONMENT!=="github-hosted"||
     process.env.PEF_NETNS_ACK!=="GITHUB_HOSTED_EPHEMERAL_ONLY")
    throw Error("LAB_BLOCKED:hosted-root-only");
  const match=ns?.edge?.match(/^pef-(\d{5}-\d+)-edge$/);
  if(!match||ns.lan!==`pef-${match[1]}-lan`||
    ns.wa!==`pef-${match[1]}-wan-a`||
    ns.wb!==`pef-${match[1]}-wan-b`)
    throw Error("LAB_BLOCKED:namespace-mismatch");
  if(typeof repoRoot!=="string"||!fs.statSync(path.join(repoRoot,"scripts/lab/netns-probe.py")).isFile())
    throw Error("LAB_BLOCKED:missing-probe-script");
}
function openLinuxNetnsPorts({ns,repoRoot}={}){
  assertHostedLinuxLab({ns,repoRoot});
  const script=path.join(repoRoot,"scripts/lab/netns-probe.py");
  const gateways={primary:["10.250.20.1","wa0"],backup:["10.250.30.1","wb0"]};
  const ip=(...args)=>execFileSync("ip",args,{encoding:"utf8",timeout:5000}).trim();
  const route=()=>ip("-n",ns.edge,"route","show","default");
  function checkRoute(selected){
    const actual=route();
    if(selected===null){if(actual!=="")throw Error("ROUTE_DIVERGENCE:"+actual);}
    else if(!gateways[selected]||!actual.includes("via "+gateways[selected][0])||
      !actual.includes("dev "+gateways[selected][1]))
      throw Error("ROUTE_DIVERGENCE:"+actual);
    return actual;
  }
  async function applyRoute(selected){
    if(selected!==null&&!Object.hasOwn(gateways,selected))
      throw Error("INVALID_ROUTING_TARGET");
    if(selected===null){if(route())ip("-n",ns.edge,"route","del","default");}
    else ip("-n",ns.edge,"route","replace","default","via",
      gateways[selected][0],"dev",gateways[selected][1]);
    checkRoute(selected);
  }
  async function probe(id){
    if(!Object.hasOwn(gateways,id))throw Error("INVALID_PROBE_TARGET");
    const description=ip("-o","-n",ns.edge,"link","show","dev",gateways[id][1]);
    const link=/\bstate UP\b/.test(description);
    if(!link)return {link:false,upstream:false,reason:"L2_DOWN"};
    const result=ip("netns","exec",ns.edge,"python3",script,id);
    if(!["UP","DOWN"].includes(result))throw Error("BAD_WAN_PROBE:"+result);
    return {link:true,upstream:result==="UP",
      reason:result==="UP"?"HEALTHY":"UPSTREAM_UNREACHABLE"};
  }
  return {kind:"PEF_LINUX_NETNS_PORTS",probe,applyRoute,checkRoute,
    scope:"ephemeral CI namespace only",physicalValidated:false};
}
module.exports={openLinuxNetnsPorts,assertHostedLinuxLab};
