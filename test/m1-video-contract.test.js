"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {recordVideo,verifyVideo}=require("../src/runtime/m1-video.js");
test("M1 video tools are optional and do not spawn browsers for regular Node tests",()=>{
 assert.equal(typeof recordVideo,"function");
 assert.equal(typeof verifyVideo,"function");
 assert.throws(()=>verifyVideo("/file/that/does/not/exist"),/ENOENT/);
});
