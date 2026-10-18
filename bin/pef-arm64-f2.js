#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {model}=require("../src/runtime/arm64-f2-retention-policy.js");
try{
 const opts={};let profile="r28s-1g",output;
 const keys={"--f1":"f1","--e2-small":"e2Small","--e2-large":"e2Large"},a=process.argv.slice(2);
 for(let i=0;i<a.length;i++){const name=a[i],value=a[++i];
  if(name==="--profile")profile=value;
  else if(name==="--output")output=value;
  else if(keys[name])opts[keys[name]]=value;
  else throw Error("F2_BAD_ARG");
 }
 if(Object.keys(opts).length!==3||Object.values(opts).some(v=>!path.isAbsolute(v))||
  (output&&!path.isAbsolute(output)))throw Error("F2_ABSOLUTE_EVIDENCE_PATHS_REQUIRED");
 const parsed={};for(const [k,v] of Object.entries(opts)){
  if(fs.statSync(v).size>262144)throw Error("F2_INPUT_TOO_LARGE");
  parsed[k]=JSON.parse(fs.readFileSync(v,"utf8"));
 }
 const report=model({profile,...parsed});
 if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report,null,2));
 if(!report.ok)process.exitCode=1;
}catch(err){console.error("F2_BLOCKED:"+String(err.message||err));process.exitCode=1;}
