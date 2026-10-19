"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {renderLabServiceUnit,checkLabServiceUnit,runM54ServiceContract}=
  require("../src/runtime/m5-systemd-unit.js");
const args={nodePath:"/usr/bin/node",releaseDir:"/tmp/pef-run/releases/v1",
  configFile:"/tmp/pef-run/edge.json",envFile:"/tmp/pef-run/edge.env",
  dataDir:"/tmp/pef-run/data",user:"runner",group:"runner"};
test("M5.4 systemd unit is allowlisted and offline-boot compatible",()=>{
  const unit=renderLabServiceUnit(args);
  assert.match(unit,/Type=exec/);
  assert.match(unit,/Restart=on-failure/);
  assert.match(unit,/WorkingDirectory=\/tmp\/pef-run\/releases\/v1/);
  assert.match(unit,/ReadWritePaths=\/tmp\/pef-run\/data/);
  assert.equal(unit.includes("network-online.target"),false);
  assert.equal(checkLabServiceUnit(unit).status,"LAB_PASS");
  assert.equal(runM54ServiceContract().activation,"NOT_RUN");
  for(const field of ["nodePath","releaseDir","configFile","envFile","dataDir"]){
    assert.throws(()=>renderLabServiceUnit({...args,[field]:"/tmp/unsafe path"}),/M54_UNSAFE/);
    assert.throws(()=>renderLabServiceUnit({...args,[field]:"/tmp/a/../b"}),/M54_UNSAFE/);
  }
  assert.throws(()=>renderLabServiceUnit({...args,user:"root;id"}),/M54_UNSAFE/);
});
