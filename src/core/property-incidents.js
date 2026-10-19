"use strict";
// Compatibility façade: Property events remain exactly M4.1-compatible.
const {createSiteOperations}=require("./site-operations.js");
const {validateSiteCommand}=require("./site-operation-contract.js");
const validatePropertyCommand=command=>validateSiteCommand("property",command);
const createPropertyIncidents=ports=>createSiteOperations({...ports,profile:"property"});
module.exports={validatePropertyCommand,createPropertyIncidents};
