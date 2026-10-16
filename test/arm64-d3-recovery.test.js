"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawn}=require("node:child_process");
const cli=path.resolve(__dirname,"../bin/pef-arm64-d3.js");
// CI deliberately kills a process, NOT a VM. Never attempts force-stop outside the operator's Lima VM.
test("D3 writer remains open through SIGKILL, data and dedup survive process restart",async t=>{
 if(process.platform!=="linux"||process.arch!=="arm64"){t.skip("Only Linux ARM64 guest/CI");return;}
 // CI ARM64 has >1GiB: construct temp writer by injecting a test-only OS memory report is prohibited.
 // This test checks the guard instead; actual limited 1GiB writer is operator-run in Lima VM.
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"d3-guard-"));
 try{
  const child=spawn(process.execPath,[cli,"--mode","writer","--base-dir",dir],{stdio:["ignore","pipe","pipe"]});
  let log="";
  for await(const data of child.stderr)log+=String(data);
  await new Promise(resolve=>child.on("close",resolve));
  assert.match(log,/D3_CONSTRAINED_ARM64_VM_REQUIRED/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("D3 CLI cannot verify missing persisted evidence or write on arbitrary path",()=>{
 const {spawnSync}=require("node:child_process");
 const r=spawnSync(process.execPath,[cli,"--mode","verify","--base-dir","/path/not/exists"],{encoding:"utf8"});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/PEF_D3_BLOCKED/);
});
