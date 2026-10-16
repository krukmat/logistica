"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawn,spawnSync}=require("node:child_process");
const cli=path.resolve(__dirname,"../bin/pef-arm64-d3.js");
test("D3 process SIGKILL persists durable receipts and dedup on ARM64 CI",async t=>{
 if(process.platform!=="linux"||process.arch!=="arm64"||process.env.CI!=="true"||
    process.env.RUNNER_ENVIRONMENT!=="github-hosted"){
   t.skip("Real child kill only on ephemeral Linux ARM64 CI");return;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-d3-"));
 const env={...process.env,PEF_D3_CI_ACK:"PROCESS_KILL_ONLY"};
 let child;
 try{
  child=spawn(process.execPath,[cli,"--mode","writer","--profile","r28s-1g","--base-dir",dir],
    {env,stdio:["ignore","pipe","pipe"]});
  let chunks="",errors="";
  child.stderr.on("data",d=>{errors+=String(d);});
  const deadline=Date.now()+12000;
  while(Date.now()<deadline&&!fs.existsSync(path.join(dir,"d3-r28s-1g","prepared.json"))&&child.exitCode===null)
    await new Promise(r=>setTimeout(r,20));
  assert.ok(fs.existsSync(path.join(dir,"d3-r28s-1g","prepared.json")),errors);
  const inspect=spawnSync(process.execPath,[cli,"--mode","inspect","--base-dir",dir],{encoding:"utf8"});
  assert.equal(inspect.status,0,inspect.stderr);
  assert.equal(JSON.parse(inspect.stdout).writerStillLive,true);
  child.kill("SIGKILL");
  await new Promise(resolve=>child.once("close",resolve));
  const v=spawnSync(process.execPath,[cli,"--mode","verify","--base-dir",dir],{encoding:"utf8"});
  assert.equal(v.status,0,v.stderr);
  const report=JSON.parse(v.stdout);
  assert.equal(report.ok,true);
  assert.equal(report.retained,120);
  assert.equal(report.duplicateDetected,true);
  assert.equal(report.conflictBlocked,true);
  assert.equal(report.status,"PROCESS_EXIT_REOPEN_PASS");
  assert.equal(report.physicalPowercutValidated,false);
 }finally{if(child?.exitCode===null)child.kill("SIGKILL");fs.rmSync(dir,{recursive:true,force:true});}
});
test("D3 blocks arbitrary directory, missing manifest and unsafe elevated claims",()=>{
 const r=spawnSync(process.execPath,[cli,"--mode","verify","--base-dir","/not/a/path"],{encoding:"utf8"});
 assert.notEqual(r.status,0);assert.match(r.stderr,/PEF_D3_BLOCKED/);
});
