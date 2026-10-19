"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseArgs,assertM56CiScope,startM56CiService}=
  require("../src/runtime/m56-kernel-service.js");
const good=["--config","/tmp/pef/config.json","--namespace","pef-s3-123-456",
  "--cgroup","/sys/fs/cgroup/pef-s3-123-456","--rootfs","/tmp/pef/root",
  "--node-inside","/opt/node/bin/node","--host-canary","/tmp/pef/canary"];
test("M5.6 CI-only service rejects missing, duplicate, nonabsolute and unknown args",()=>{
 assert.equal(parseArgs(good)["--namespace"],"pef-s3-123-456");
 for(const args of [good.slice(0,-2),[...good,"--profile","host"],
  [...good.slice(0,2),...good.slice(0,2),...good.slice(4)],
  good.map(x=>x==="/tmp/pef/root"?"../root":x),
  good.map(x=>x==="/tmp/pef/config.json"?"/tmp/x/../config.json":x)])
  assert.throws(()=>parseArgs(args),/M56_/);
});
test("M5.6 isolated systemd service fails closed outside hosted kernel lab",async()=>{
 assert.throws(()=>assertM56CiScope({}),/LAB_BLOCKED/);
 await assert.rejects(startM56CiService(good,{env:{PEF_M56_ACK:"GITHUB_HOSTED_EPHEMERAL_SERVICE_ONLY"}}),
  /LAB_BLOCKED/);
});
