#!/usr/bin/env node
"use strict";
// Deliberately kill ONLY this dedicated test child process after a successful fsync ACK.
const fs=require("node:fs");
const {createFileJournal}=require("../src/emulator/lab/file-journal.js");
const dir=process.argv[2];
if(!dir)process.exit(2);
const j=createFileJournal({dir,capacityBytes:65536});
const result=j.append({eventId:"crash-acked",payload:{committed:true},category:"O1"});
if(!result.ack)process.exit(3);
fs.writeSync(1,"FSYNC_ACK\n");
process.kill(process.pid,"SIGKILL");
