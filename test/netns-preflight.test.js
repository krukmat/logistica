"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
test("netns lab denies execution without explicit ephemeral-runner preflight",()=>{
  const pathToScript=path.resolve(__dirname,"../scripts/lab/netns-smoke.sh");
  const out=spawnSync("bash",[pathToScript],{
    encoding:"utf8",timeout:4000,env:{PATH:process.env.PATH||"/usr/bin:/bin"}
  });
  assert.equal(out.status,78,out.stderr);
  assert.match(out.stderr,/LAB_BLOCKED/);
});
