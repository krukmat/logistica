#!/usr/bin/env node
"use strict";
const {createDashboardServer}=require("../src/emulator/dashboard-server.js");
const n=Number(process.env.PEF_DASHBOARD_PORT||8787);
const app=createDashboardServer({port:n});
app.listen().then(url=>{
  console.log("PEF Control Panel (SIMULATION + LOCAL SOFTWARE LAB): "+url);
  console.log("No physical interfaces, routes, or Cloud accounts are modified.");
  console.log("Stop with Ctrl+C.");
}).catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
