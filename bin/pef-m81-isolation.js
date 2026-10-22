#!/usr/bin/env node
"use strict";
// Contract introspection or actual guest-scoped read-only authorization check.
// Neither mode creates namespaces/cgroups or starts services.
const {runM81B1IsolationContract}=require("../src/runtime/m81-b1-isolation-contract.js");
const {assertM81LimaIsolationPreflight}=require("../src/adapters/m81-lima-isolation-scope.js");
try{
 const args=process.argv.slice(2);
 if(args.length!==1||!["--contract","--guest-check"].includes(args[0]))
  throw Error("M81_B1_USAGE: npm run m8:isolation -- --contract|--guest-check");
 if(args[0]==="--contract"){
  console.log(JSON.stringify(runM81B1IsolationContract(),null,2));
 }else{
  const result=assertM81LimaIsolationPreflight();
  console.log(JSON.stringify({...result,guestOperationsPerformed:false},null,2));
 }
}catch(e){
 console.error("M81_B1_BLOCKED:"+String(e.message||e));
 process.exitCode=78;
}
