#!/usr/bin/env node
"use strict";
// CI-only gate: consumes actual GitHub job statuses and Linux artifact assertions.
const fs=require("node:fs"),path=require("node:path");
const {evaluatePreHardwareGate}=require("../src/runtime/handoff-gate.js");
function main(args){
  if(process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
     args.length!==2||args[0]!=="--output"||!path.isAbsolute(args[1]))
    throw Error("CI_EVIDENCE_AND_ABSOLUTE_OUTPUT_REQUIRED");
  const expected=["src/runtime/autonomous-edge.js","src/runtime/edge-config.js",
    "src/runtime/edge-service.js","src/adapters/linux-netns-ports.js",
    "src/adapters/linux-isolated-process-driver.js","bin/pef-edge.js",
    "test/edge-autonomous.test.js","test/dashboard-integrated.test.js",
    "docs/contracts/emulator-integration-v1.json"];
  const root=path.resolve(__dirname,"..");
  const registry=JSON.parse(fs.readFileSync(path.join(root,
    "docs/contracts/emulator-integration-v1.json"),"utf8"));
  const filesPresent=expected.every(p=>fs.existsSync(path.join(root,p)))&&
    registry.features.some(f=>f.task==="W1.9.T"&&f.mode==="lab");
  const readFile=name=>{
    try{return JSON.parse(fs.readFileSync(path.join(process.env.PEF_LAB_EVIDENCE_DIR||"",name),"utf8"));}
    catch{return null;}
  };
  const policyEvidence=readFile("pef-netns-policy.json");
  const supervisedEvidence=readFile("pef-s34-evidence.json");
  const result=evaluatePreHardwareGate({
    emulatorResult:process.env.PEF_EMULATOR_RESULT,
    linuxResult:process.env.PEF_LINUX_RESULT,
    policyEvidence,supervisedEvidence,filesPresent
  });
  fs.writeFileSync(args[1],JSON.stringify(result,null,2)+"\n",{mode:0o600});
  process.stdout.write("PEF_PRE_HARDWARE_GATE="+JSON.stringify(result)+"\n");
  if(result.status!=="SOFTWARE_LAB_READY")process.exitCode=1;
}
try{main(process.argv.slice(2));}catch(e){console.error("PEF_HANDOFF_GATE_FAILED:"+String(e.message||e));process.exitCode=1;}
