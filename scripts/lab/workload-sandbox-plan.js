#!/usr/bin/env node
"use strict";
const {makeLinuxIsolationPlan}=require("../../src/adapters/linux-workload-isolation.js");
const {demoManifest}=require("../../src/runtime/demo-workload.js");
const plan=makeLinuxIsolationPlan(demoManifest());
if(process.argv[2]==="--fields")process.stdout.write(
  plan.cpuMax+"\n"+plan.memoryMax+"\n"+plan.pidsMax+"\n");
else process.stdout.write(JSON.stringify(plan)+"\n");
