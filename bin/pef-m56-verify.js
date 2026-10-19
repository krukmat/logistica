#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {verifyM56Report}=require("../src/runtime/m56-evidence.js");
try{
 const [file,...extra]=process.argv.slice(2);
 if(!file||extra.length||!path.isAbsolute(file))throw Error("M56_ABSOLUTE_EVIDENCE_FILE_REQUIRED");
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>1048576)
   throw Error("M56_EVIDENCE_FILE_UNSAFE");
 const result=verifyM56Report(JSON.parse(fs.readFileSync(file,"utf8")));
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error("M56_EVIDENCE_DENIED:"+String(e.message||e));process.exitCode=1;}
