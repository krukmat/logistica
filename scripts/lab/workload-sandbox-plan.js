#!/usr/bin/env node
"use strict";
const {makeLinuxIsolationPlan}=require("../../src/adapters/linux-workload-isolation.js");
const {demoManifest}=require("../../src/runtime/demo-workload.js");
const plan=makeLinuxIsolationPlan(demoManifest());
process.stdout.write(JSON.stringify(plan)+"\n");
