#!/usr/bin/env node
"use strict";
// Privileged probe/route adapter. Opt-in ONLY on GitHub-hosted ephemeral runners.
// Every route and address mutation targets a matching PEF test namespace.
const {execFileSync}=require("node:child_process");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {createFileJournal}=require("../../src/adapters/os-file-journal.js");
const {openRuntimeBackend}=require("../../src/runtime/backend-registry.js");
const {createAutonomousEdgeHost}=require("../../src/runtime/autonomous-edge.js");
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
let activeBackend=null;
const probeWan=id=>activeBackend.ports.probe(id);
const applyRoute=id=>activeBackend.ports.applyRoute(id);
const checkRoute=id=>activeBackend.ports.checkRoute(id);
async function client(expect){
  let failure;
  // Only new TCP flows; tolerate brief ARP/neighbour convergence after route migration.
  for(let attempt=1;attempt<=5;attempt++){
    try{return {response:ip("netns","exec",ns.lan,"python3",clientScript,expect),attempts:attempt};}
    catch(err){failure=err;if(attempt<5)await new Promise(resolve=>setTimeout(resolve,350));}
  }
  throw Error("LAN_PROBE_FAILED_AFTER_RETRIES:"+String(failure?.message||failure));
}
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"pef-netns-edge-"));
const opened=openRuntimeBackend("linux-lab",{dir:scratch,ns,repoRoot:root,identity:{siteId:"lab-site",deviceId:"lab-netns",configRevision:"cfg-1"},probe:probeWan,applyRoute,
  simulatorOptions:{failbackHoldSeconds:5},journalOptions:{capacityBytes:65536,controlReserveBytes:8192}});
if(!opened.ok)throw Error("LAB_BLOCKED:"+opened.error);
activeBackend=opened;
const ctrl=opened.engine;
const assertions=[],failures=[];
function assertLab(id,valid,details){
  assertions.push({id,ok:!!valid,details});
  if(!valid)throw Error("ORACLE_FAILED:"+id);
}
async function phase(id,seconds,expectedWan,expectedResponse){
  const outcome=await ctrl.sample(seconds);
  const observed=outcome.observed;
  if(outcome.event)assertLab(id+"-journal-fsync",
    outcome.event.ack===true&&outcome.event.fsyncCompleted===true,
    {eventId:outcome.event.eventId,ack:outcome.event.ack,fsyncCompleted:outcome.event.fsyncCompleted});
  assertLab(id,observed.selectedWan===expectedWan&&observed.routeApplied&&observed.health==="HEALTHY",{
    selected:observed.selectedWan,connectivity:observed.connectivity,clock:observed.logicalTime,probes:observed.probes,route:checkRoute(expectedWan)});
  if(expectedResponse){
    const checked=await client(expectedResponse);
    assertLab(id+"-client",checked.response.includes("OBSERVED_"+expectedResponse),checked);
  }
}
async function run(){
  let aLost=false,bLost=false;
  try{
    await phase("initial",1,"primary","WAN_A");
    ip("-n",ns.wa,"addr","del","10.250.20.1/24","dev","eth0");aLost=true;
    assertLab("carrier-up-while-upstream-unreachable",/\bstate UP\b/.test(ip("-o","-n",ns.edge,"link","show","dev","wa0")),null);
    await phase("primary-unreachable",1,"backup","WAN_B");
    ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");
    ip("-n",ns.wa,"route","replace","10.250.10.0/24","via","10.250.20.2","dev","eth0");aLost=false;
    await phase("failback-hold",1,"backup","WAN_B");
    assertLab("primary-return-path-restored",ip("-n",ns.wa,"route","show","10.250.10.0/24").includes("via 10.250.20.2"),null);
    await phase("failback-stable",5,"primary","WAN_A");
    ip("-n",ns.wa,"addr","del","10.250.20.1/24","dev","eth0");aLost=true;
    ip("-n",ns.wb,"addr","del","10.250.30.1/24","dev","eth0");bLost=true;
    await phase("all-wan-unreachable",1,null,"DOWN");
    const ping=ip("netns","exec",ns.lan,"ping","-q","-c","1","-W","1","10.250.10.1");
    assertLab("local-lan-remains-operational",/\b0% packet loss\b/.test(ping),ping);
    ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");
    ip("-n",ns.wa,"route","replace","10.250.10.0/24","via","10.250.20.2","dev","eth0");aLost=false;
    await phase("restored",1,"primary","WAN_A");
  }catch(err){failures.push(String(err.stack||err));}
  finally{
    try{
      if(aLost){ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");ip("-n",ns.wa,"route","replace","10.250.10.0/24","via","10.250.20.2","dev","eth0");}
      if(bLost){ip("-n",ns.wb,"addr","add","10.250.30.1/24","dev","eth0");ip("-n",ns.wb,"route","replace","10.250.10.0/24","via","10.250.30.2","dev","eth0");}
      await applyRoute("primary");
    }catch(err){failures.push("RESTORE_FAILED:"+String(err.stack||err));}
  }
  // Verify actual OS-file journal reopens with all ACKed transition events intact.
  let recoveredJournal=null,previousJournal=null;
  try{
    previousJournal=ctrl.status().storage;
    ctrl.close();
    const reopened=createFileJournal({dir:scratch,capacityBytes:65536,controlReserveBytes:8192});
    try{recoveredJournal=reopened.status();}
    finally{reopened.close();}
    assertLab("integrated-journal-reopen",recoveredJournal.events===previousJournal.events&&
      recoveredJournal.pending===previousJournal.pending&&!recoveredJournal.unsafe&&recoveredJournal.events>=4,
      {before:previousJournal,after:recoveredJournal});

    // T3: same PEF Edge autonomous host uses Linux netns probe/route ports and real OS P1.
    const labToken="ci-netns-standalone-edge-operator-token-2026";
    const config={schemaVersion:1,backend:"linux-lab",
      identity:{siteId:"lab-site",deviceId:"lab-netns",configRevision:"cfg-1"},
      storageDir:scratch,http:{host:"127.0.0.1",port:0},
      sampleIntervalMs:200,workload:{enabled:false,reconcileMs:250},
      journal:{capacityBytes:65536,controlReserveBytes:8192},
      linuxLab:{ns,repoRoot:root}};
    const standalone=createAutonomousEdgeHost({config,token:labToken});
    let hostStarted=false,removedA=false,removedB=false;
    const get=async(base,p,body)=>{
      const res=await fetch(base+p,{method:body?"POST":"GET",headers:{
        "x-pef-token":labToken,...(body?{"content-type":"application/json"}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      return {http:res.status,...await res.json()};
    };
    const awaitOffline=async(base)=>{
      for(let i=0;i<30;i++){
        const state=await get(base,"state");
        if(state.network.connectivity==="LOCAL_ONLY")return state;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw Error("STANDALONE_LINUX_OFFLINE_TIMEOUT");
    };
    try{
      const base=await standalone.listen();hostStarted=true;
      const initial=await get(base,"state");
      assertLab("standalone-linux-bootstrap",initial.backend==="linux-lab"&&
        initial.network.selectedWan==="primary"&&initial.dashboardRequired===false&&
        initial.storage.unsafe===false,{selectedWan:initial.network.selectedWan});
      ip("-n",ns.wa,"addr","del","10.250.20.1/24","dev","eth0");removedA=true;
      ip("-n",ns.wb,"addr","del","10.250.30.1/24","dev","eth0");removedB=true;
      const offline=await awaitOffline(base);
      assertLab("standalone-linux-offline",offline.network.selectedWan===null,{state:offline.network});
      const accepted=await get(base,"receipts",{receiptId:"LINUX-T3-001",packageId:"EDGE-BOX-001"});
      assertLab("standalone-linux-fsync",accepted.http===201&&accepted.fsyncCompleted===true,accepted);
      ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");
      ip("-n",ns.wa,"route","replace","10.250.10.0/24","via","10.250.20.2","dev","eth0");removedA=false;
      ip("-n",ns.wb,"addr","add","10.250.30.1/24","dev","eth0");
      ip("-n",ns.wb,"route","replace","10.250.10.0/24","via","10.250.30.2","dev","eth0");removedB=false;
    }finally{
      if(removedA){
        ip("-n",ns.wa,"addr","add","10.250.20.1/24","dev","eth0");
        ip("-n",ns.wa,"route","replace","10.250.10.0/24","via","10.250.20.2","dev","eth0");
      }
      if(removedB){
        ip("-n",ns.wb,"addr","add","10.250.30.1/24","dev","eth0");
        ip("-n",ns.wb,"route","replace","10.250.10.0/24","via","10.250.30.2","dev","eth0");
      }
      await standalone.close();
    }
    // A second host instance must reopen the same physical OS journal without dashboard.
    const repeated=createAutonomousEdgeHost({config,token:labToken});
    try{
      const base=await repeated.listen();
      const state=await get(base,"state");
      assertLab("standalone-linux-reopen",state.receipts.some(r=>
        r.receiptId==="LINUX-T3-001"&&r.fsyncRecorded===true),{
          retainedReceipts:state.receipts.length,selectedWan:state.network.selectedWan});
    }finally{await repeated.close();}

  }catch(err){failures.push("JOURNAL_REOPEN_FAILED:"+String(err.stack||err));}
  finally{try{ctrl.close();fs.rmSync(scratch,{recursive:true,force:true});}catch(err){failures.push("LAB_JOURNAL_CLEANUP_FAILED:"+String(err));}}
  const evidence={kind:"PEF_NETNS_POLICY_LAB",status:failures.length?"LAB_FAIL":"LAB_PASS",
    scope:"real Linux veth peer HTTP probes and isolated route table; logical decision model",
    physicalWanValidated:false,hardwareValidated:false,latencyPercentilesValidated:false,
    assertions,failures,observations:ctrl.observations(),simulatorTrace:ctrl.controllerTrace(),
    journalEvidence:{osFsyncLab:true,reopened:recoveredJournal?.events===previousJournal?.events,
      events:recoveredJournal?.events||0,physicalPowerCutValidated:false},
    limitations:["No physical WAN or NAT/firewall throughput","Failback seconds are logical ticks, not measured p95","Only isolated test namespace routes modified"]};
  if(process.env.PEF_NETNS_POLICY_EVIDENCE)fs.writeFileSync(process.env.PEF_NETNS_POLICY_EVIDENCE,JSON.stringify(evidence,null,2)+"\n");
  process.stdout.write(JSON.stringify({kind:evidence.kind,status:evidence.status,assertions,failures})+"\n");
  if(failures.length)process.exitCode=1;
}
run().catch(e=>{console.error("LAB_FAIL",String(e));process.exitCode=1;});
