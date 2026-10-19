"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createFileJournal}=require("../src/adapters/os-file-journal.js");
const {createPropertyIncidents,validatePropertyCommand}=require("../src/core/property-incidents.js");
const {runPropertySmoke}=require("../src/emulator/lab/property-smoke.js");
const IDENTITY={siteId:"test-site",deviceId:"test-property",configRevision:"r1"};
const alert={operation:"ALERT",incidentId:"INC-1",assetId:"PUMP-1",severity:"WARNING"};
test("M4.1 Property immutable journal: ACK only after fsync, no false ACK, replay across reopen",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pef-property-unit-"));
  let journal;
  try{
    assert.equal(validatePropertyCommand({...alert,evil:"remote-code"}).ok,false);
    assert.equal(validatePropertyCommand({operation:"ACK",incidentId:"INC-1"}).ok,true);
    journal=createFileJournal({dir,capacityBytes:12000,controlReserveBytes:1000});
    let property=createPropertyIncidents({journal,identity:IDENTITY});
    assert.equal(property.apply({operation:"ACK",incidentId:"INC-1"}).error,"PROPERTY_ALERT_NOT_FOUND");
    let r=property.apply(alert);
    assert.equal(r.fsyncCompleted,true);assert.equal(r.duplicate,false);
    assert.equal(property.apply(alert).duplicate,true);
    assert.equal(property.apply({...alert,severity:"CRITICAL"}).error,"EVENT_ID_CONFLICT");
    r=property.apply({operation:"ACK",incidentId:"INC-1"});
    assert.equal(r.fsyncCompleted,true);
    assert.equal(property.list()[0].status,"ACKNOWLEDGED");
    journal.close();journal=createFileJournal({dir,capacityBytes:12000,controlReserveBytes:1000});
    property=createPropertyIncidents({journal,identity:IDENTITY});
    assert.equal(property.list()[0].status,"ACKNOWLEDGED");
    assert.equal(property.apply({operation:"ACK",incidentId:"INC-1"}).duplicate,true);
    assert.equal(journal.status().pending,2);
  }finally{journal?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test("M4.1 real HTTP supervised Property offline/restart/replay smoke",async()=>{
  const result=await runPropertySmoke();
  assert.equal(result.status,"LAB_PASS",JSON.stringify(result));
  assert.equal(Object.values(result.checks).every(Boolean),true);
  assert.equal(result.physicalValidated,false);
  assert.equal(result.actualLimitsEnforced,false);
});
