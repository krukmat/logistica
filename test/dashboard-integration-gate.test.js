"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
test("implemented features require a dashboard entry, actual backend and integration test",()=>{
  const registry=JSON.parse(fs.readFileSync(path.join(root,"docs/contracts/emulator-integration-v1.json"),"utf8"));
  const html=fs.readFileSync(path.join(root,"public/dashboard.html"),"utf8");
  const client=fs.readFileSync(path.join(root,"public/dashboard.js"),"utf8");
  const server=fs.readFileSync(path.join(root,"src/emulator/dashboard-server.js"),"utf8");
  assert.equal(registry.schemaVersion,1);
  assert.equal(server.includes("createDashboardLab"),true);
  assert.equal(server.includes('body.command==="lab"'),true);
  const ids=registry.features.map(x=>x.task);
  assert.equal(new Set(ids).size,ids.length);
  for(const required of ["W1.9.F","W1.9.I","W1.9.J","W1.9.K",
    "W1.9.L","W1.9.M","W1.9.N","W1.9.O"])assert.ok(ids.includes(required));
  for(const feature of registry.features){
    assert.ok(fs.existsSync(path.join(root,feature.implementation)),"Backend absent: "+feature.task);
    assert.ok(fs.existsSync(path.join(root,feature.test)),"Integration test absent: "+feature.task);
    assert.equal(feature.hardwareValidated,false);
    for(const id of feature.controlIds)
      assert.ok(html.includes('id="'+id+'"'),"UI control missing "+feature.task+"/"+id);
    if(feature.mode==="lab"){
      for(const action of feature.actions){
        const jsBinding='labAction("'+action+'"';
        const combined=client+fs.readFileSync(path.join(root,"src/emulator/dashboard-lab.js"),"utf8");
        assert.ok(combined.includes(jsBinding)||combined.includes('case "'+action+'"'),
          "Missing lab action "+feature.task+"/"+action);
      }
    }else if(feature.mode==="ci-evidence"){
      assert.ok(feature.uiEvidenceUrl.startsWith("https://github.com/krukmat/logistica/actions/"));
      assert.ok(html.includes(feature.uiEvidenceUrl));
      assert.ok(html.includes("CI-only"));
      assert.equal(feature.actions.length,0);
    }else assert.equal(feature.mode,"sim");
  }
});
