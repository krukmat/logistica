"use strict";
// Compatibility façade for existing laboratory callers; policy/business code lives in src/core/.
const {openEdgeService}=require("../../runtime/edge-service.js");
function createEdgeRuntime({probe,applyRoute,...rest}={}){
  return openEdgeService({ports:{probe,applyRoute},...rest});
}
module.exports={createEdgeRuntime};
