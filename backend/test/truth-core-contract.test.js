"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fsp = require("node:fs/promises");
const fp = require("../src/judgeFingerprint"), oracle = require("../src/oracleTrust"), evidence = require("../src/evidenceStore");
const store = require("../src/problemStore"), settings = require("../src/settingsStore"), state = require("../src/judgeState"), runCpp = require("../src/runCpp");
const {LIMITS} = require("../src/config");
const fileStore = require("../src/fileStore");
async function problem(fn) {
  const p=await store.createProblem({title:"zz-truth-contract",code:"int main(){}",tests:[{input:"2 3\n",expected:"5\n"}]});
  try {return await fn(p.id)} finally {await store.deleteProblem(p.id)}
}
test("canonical digest covers every verdict input and is independent of object key order", () => {
  const original=fp.buildInputs({code:"int main(){}",tests:[{id:"01",input:"2 3",expected:"5"}],checker:"checker",settings:fp.effectiveSettings({}),compiler:{digest:"gcc-A"},engine:{runner:"engine-A"}});
  const baseline=fp.fingerprint(original);
  const edits=[
    x=>x.source.code+=" ",x=>x.tests[0].input="4 5",x=>x.tests[0].expected="999",
    x=>x.tests.push({...x.tests[0],id:"02"}),x=>x.checker.code+=" ",
    x=>x.comparator.mode="strict",x=>x.comparator.epsilon=0.1,
    x=>x.compiler.digest="gcc-B",x=>x.compiler.standard="c++20",x=>x.compiler.optimization="-O0",
    x=>x.compiler.fixedFlags.push("-g"),x=>x.limits.timeMs++,x=>x.limits.memoryLimitMB=100,
    x=>x.limits.stdoutBytes++,x=>x.limits.stderrBytes++,x=>x.limits.compileMs++,
    x=>x.fileMode={name:"milk"},x=>x.engine.runner="engine-B",
  ];
  for (const edit of edits) {const changed=structuredClone(original);edit(changed);assert.notEqual(fp.fingerprint(changed),baseline)}
  assert.equal(fp.fingerprint(Object.fromEntries(Object.entries(original).reverse())),baseline);
});
test("real capture changes on tests, source, settings, checker and file IO; title and notes do not invalidate", async()=>problem(async id=>{
  const a=(await state.capture(id)).judgeFingerprint;
  await store.updateProblem(id,{title:"different title"});await store.setFile(id,"notes","a note");
  assert.equal((await state.capture(id)).judgeFingerprint,a);
  await store.updateTest(id,"01",{expected:"6"});assert.notEqual((await state.capture(id)).judgeFingerprint,a);
  await store.updateTest(id,"01",{expected:"5\n"});assert.equal((await state.capture(id)).judgeFingerprint,a);
  await store.setFile(id,"code","int main(){return 1;}");assert.notEqual((await state.capture(id)).judgeFingerprint,a);
  await store.setFile(id,"code","int main(){}");
  await store.updateProblem(id,{usesChecker:true});await store.setFile(id,"checker","int main(){return 0;}");assert.notEqual((await state.capture(id)).judgeFingerprint,a);
  await store.updateProblem(id,{usesChecker:false,usacoMode:true,fileName:"milk"});assert.notEqual((await state.capture(id)).judgeFingerprint,a);
  await store.updateProblem(id,{usacoMode:false});
  const saved=await settings.getSettings();try{await settings.saveSettings({compareMode:"strict"});assert.notEqual((await state.capture(id)).judgeFingerprint,a)}finally{await settings.saveSettings(saved)}
}));
test("candidate receipts ignore client claims; explicit review is content bound and invalidated by edit", async()=>problem(async id=>{
  const ai=await store.addTest(id,{input:"4 5",expected:"999",generatedBy:"ai",expectedKnown:true,oracle:{state:"trusted",method:"user-reviewed"}});
  assert.equal(ai.oracle.state,"candidate");
  await assert.rejects(()=>store.trustTest(id,ai.id,{method:"user-reviewed",contentHash:"old"}),e=>e.status===409);
  assert.equal((await state.capture(id)).tests.some(t=>t.id===ai.id),false);
  await store.trustTest(id,ai.id,{method:"user-reviewed",contentHash:ai.oracle.contentHash});
  assert.equal((await state.capture(id)).tests.some(t=>t.id===ai.id),true);
  await store.updateTest(id,ai.id,{expected:"9"});assert.equal((await state.capture(id)).tests.some(t=>t.id===ai.id),false);
}));
test("an all-candidate suite never falls back to scratch expected", async()=>problem(async id=>{
  await store.deleteTest(id,"01");await store.setFile(id,"input","2 3");await store.setFile(id,"expected","999");
  await store.addTest(id,{input:"4 5",expected:"999",generatedBy:"ai"});
  assert.equal((await state.capture(id)).tests.length,0);
}));
test("statement samples are explicitly matched, AI-authored statements cannot self-attest",()=>{
  const statement="## Sample Input\n```\n1 2\n```\n## Sample Output\n```\n3\n```";
  const t={input:"1 2",expected:"3",generatedBy:"ai"};
  assert.equal(oracle.initial(t,statement,"imported").state,"trusted");
  assert.equal(oracle.initial(t,statement,"ai-generated").state,"candidate");
  const receipt=oracle.initial(t,statement,"imported");
  assert.equal(oracle.read(t,receipt,statement+" changed").state,"candidate");
});
test("attempt publication cannot overwrite existing source or compiler evidence; restart read is exact",async()=>problem(async id=>{
  await store.setFile(id,"code","bad_source\n");
  const context=await state.capture(id), runId=evidence.createRunId();
  const input={record:{id:runId,at:new Date().toISOString(),type:"judge",verdict:"CE"},code:"bad_source\n",result:{compileOk:false,compile:{stderr:"exact CE\r\n",timeMs:7},results:[]},inputSnapshot:context.inputs,judgeFingerprint:context.judgeFingerprint,scope:"full"};
  const ref=await evidence.saveRunEvidence(id,input);const first=await evidence.readEvidence(id,ref.id);
  await assert.rejects(()=>evidence.saveRunEvidence(id,input),e=>e.code==="EEXIST");
  await assert.rejects(()=>evidence.saveRunEvidence(id,{...input,code:"overwrite"}),/does not match/);
  delete require.cache[require.resolve("../src/evidenceStore")];
  const reloaded=await require("../src/evidenceStore").readEvidence(id,ref.id);
  assert.deepEqual(reloaded,first);assert.equal(reloaded.compile.stderr,"exact CE\r\n");
  assert.equal(reloaded.testEvidence[0].execution,null);assert.equal(reloaded.codeSnapshot.code,"bad_source\n");
}));
for(const channel of ["stdout","stderr"])test(channel+" overflow has bounded UTF-8 evidence and explicit error",async()=>{
  const s=await settings.getSettings();
  const code='#include <cstdio>\nint main(){for(int i=0;i<1200000;++i)std::fputc(65,'+(channel==="stderr"?"stderr":"stdout")+');}';
  const built=await runCpp.compileStandalone({code,settings:s});
  try{assert.equal(built.ok,true,built.stderr);const r=await runCpp.runBinary({binaryPath:built.binaryPath,input:"",timeMs:3000});assert.equal(r.errorCode,"OUTPUT_LIMIT");assert.equal(r.outputChannel,channel);assert.ok(Buffer.byteLength(r.stdout)<=LIMITS.maxOutputBytes);assert.ok(Buffer.byteLength(r.stderr)<=LIMITS.maxStderrBytes)}finally{await runCpp.cleanupWorkdir(built.workdir)}
});
test("single and cancelled attempts stay inspectable but cannot establish current AC", async()=>problem(async id=>{
  for (const mode of ["single","cancelled"]) {
    const ctx=await state.capture(id,mode==="single"?{onlyTestId:"01"}:{});
    await evidence.saveRunEvidence(id,{record:{id:evidence.createRunId(),at:new Date().toISOString(),type:"judge",verdict:mode==="single"?"AC":"CANCELLED"},code:ctx.code,result:{compileOk:true,compile:{stderr:""},results:[]},inputSnapshot:ctx.inputs,judgeFingerprint:ctx.judgeFingerprint,scope:mode==="single"?"single":"full",cancelled:mode==="cancelled"});
  }
  const history=await store.listHistory(id);
  assert.equal(history.length,2);assert.ok(history.some(h=>h.cancelled));assert.ok(history.some(h=>h.scope==="single"));
  const contract=await state.contract(id);assert.equal(contract.currentVerdict,null);assert.notEqual(contract.derivedStatus,"verified");
}));
test("invalid identifiers in update/delete are rejected before filesystem operations",async()=>{
 const original=fsp.lstat;let touches=0;fsp.lstat=async()=>{touches++;throw Error("FILESYSTEM_TOUCHED")};
 try{for(const id of ["../escape","a/b","a\\b","CON","01:ads","%2fescape",""]){await assert.rejects(()=>store.updateTest("safe-problem",id,{expected:"x"}),e=>e.status===400);await assert.rejects(()=>store.deleteTest("safe-problem",id),e=>e.status===400)}assert.equal(touches,0)}finally{fsp.lstat=original}
});
test("linked testcase roots fail before reading testcase contents",async()=>{
 const original=fsp.lstat;fsp.lstat=async target=>({isSymbolicLink:()=>String(target).endsWith("tests")});
 try{await assert.rejects(()=>require("../src/testPaths").rejectLinks("safe-problem","01"),e=>e.status===400&&e.code==="INVALID_TEST_PATH")}finally{fsp.lstat=original}
});
test("unsafe on-disk identifiers never silently remove a check from a suite",async()=>problem(async id=>{
 const original=fileStore.listFiles;fileStore.listFiles=async()=>["a.b.in"];
 try{await assert.rejects(()=>store.listTests(id),e=>e.status===400&&e.code==="INVALID_TEST_ID")}finally{fileStore.listFiles=original}
}));
test("provider diagnostics redact raw/URI secret material and URL credentials",()=>{
 const {redact}=require("../src/secretRedaction");
 const key="fixture/SECRET+=123",querySecret="query-only-fixture",password="private-fixture";
 const config={apiKey:key,baseUrl:"https://user:"+password+"@example.test/v1?api_key="+querySecret};
 const result=redact("401 "+key+" "+encodeURIComponent(key)+" "+password+" "+querySecret+" Bearer arbitrary-value",config);
 for(const s of [key,encodeURIComponent(key),password,querySecret,"arbitrary-value"])assert.equal(result.includes(s),false);
 assert.match(result,/401/);
});
test("new attempts never rewrite legacy history bytes or invent missing legacy source",async()=>problem(async id=>{
 const path=require("node:path"),legacyPath=path.join(fileStore.problemDir(id),"history.json");
 const raw=JSON.stringify({entries:[{at:"2025-01-01T00:00:00Z",type:"judge",verdict:"CE",code:"original bad code",stderr:"original diagnostic"}]},null,3);
 await fsp.writeFile(legacyPath,raw);
 await store.recordRun(id,{type:"run",verdict:"OK",snapshot:{code:"new source",stdout:"new output",stderr:""}});
 assert.equal(await fsp.readFile(legacyPath,"utf8"),raw);
 const history=await store.listHistory(id);
 assert.ok(history.some(h=>h.code==="original bad code"&&h.stderr==="original diagnostic"));
 assert.ok(history.some(h=>h.code==="new source"));
}));
