#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {evaluate}=require("../src/runtime/arm64-e-final-gate.js");
try{
 const args=process.argv.slice(2),paths={},map={"--d4":"d4","--e1":"e1","--e2-small":"e2Small","--e2-large":"e2Large"};
 let profile="r28s-1g",output=null;
 for(let i=0;i<args.length;i++){
  const k=args[i],v=args[++i];
  if(k==="--profile")profile=v;else if(k==="--output")output=v;
  else if(map[k])paths[map[k]]=v;else throw Error("E5_INVALID_ARGUMENT");
 }
 if(Object.keys(paths).length!==4||Object.values(paths).some(x=>!path.isAbsolute(x))||
   output&&!path.isAbsolute(output))throw Error("E5_EXPECTS_FOUR_ABSOLUTE_EVIDENCE_PATHS");
 const parsed={};
 for(const [k,p] of Object.entries(paths)){
  if(fs.statSync(p).size>131072)throw Error("E5_EVIDENCE_TOO_LARGE");
  parsed[k]=JSON.parse(fs.readFileSync(p,"utf8"));
 }
 const r=evaluate({profile,...parsed});
 if(output)fs.writeFileSync(output,JSON.stringify(r,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
}catch(e){console.error("E5_BLOCKED:"+String(e.message||e));process.exitCode=1;}
