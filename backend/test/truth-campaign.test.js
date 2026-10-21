'use strict';
// Audit regressions: these assertions intentionally fail on the audited ZIP.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const problemStore=require('../src/problemStore'),settings=require('../src/settingsStore'),fileStore=require('../src/fileStore');
const judge=require('../src/judgeService'),runCpp=require('../src/runCpp'),ai=require('../src/ai'),{buildApp}=require('../server');
const {LIMITS}=require('../src/config');
async function server(fn){const s=http.createServer(buildApp());await new Promise(r=>s.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${s.address().port}`;const request=async(method,url,body)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}};try{return await fn(request)}finally{await new Promise(r=>s.close(r))}}
async function problem(fn){const p=await problemStore.createProblem({title:'zz-truth-campaign',code:'int main(){return 0;}',tests:[{name:'sum',input:'2 3\n',expected:'5\n'}]});try{return await fn(p.id)}finally{await problemStore.deleteProblem(p.id)}}
function fakeJudge(verdict='AC'){return async({tests})=>({verdict,compileOk:verdict!=='CE',compile:{stderr:verdict==='CE'?'main.cpp:1: error: AUDIT_EXACT_COMPILER_ERROR\n':'',timeMs:3},results:verdict==='CE'?[]:tests.map(t=>({testId:t.id,name:t.name,input:t.input,expected:t.expected,actual:'5\n',stderr:'',status:t.expected.trim()==='5'?'AC':'WA',timeMs:1})),summary:{total:tests.length,passed:verdict==='AC'?tests.length:0,failed:verdict==='AC'?0:tests.length,timeMs:1}})}
async function withJudge(fn,verdict='AC'){const old=judge.compileAndJudge;judge.compileAndJudge=fakeJudge(verdict);try{return await fn()}finally{judge.compileAndJudge=old}}

test('A02 AC -> expected edit -> stale; historical accepted attempt retained',async()=>withJudge(()=>problem(id=>server(async req=>{
 const base='/api/problems/'+id;const judged=await req('POST',base+'/judge',{});assert.equal(judged.status,200,JSON.stringify(judged.data));const before=(await req('GET',base+'/verified-artifact')).data.artifact;assert.equal(before.derivedStatus,'verified');
 await req('PUT',base+'/tests/01',{expected:'999\n'});const after=(await req('GET',base+'/verified-artifact')).data.artifact;assert.equal(after.derivedStatus,'stale');assert.equal(after.nextAction.id,'judge-full-suite');
 const history=(await req('GET',base+'/history')).data.history;assert.equal(history[0].verdict,'AC');
}))));
test('A04 list/detail agree immediately after AC and source edit requests rejudge',async()=>withJudge(()=>problem(id=>server(async req=>{
 const base='/api/problems/'+id;await req('POST',base+'/judge',{});const detail=(await req('GET',base+'/verified-artifact')).data.artifact;const list=(await req('GET','/api/problems')).data.problems.find(p=>p.id===id);assert.equal(list.derivedStatus,detail.derivedStatus);
 await req('PUT',base+'/code',{code:'int main(){return 0;}\n// change'});const stale=(await req('GET',base+'/verified-artifact')).data.artifact;assert.equal(stale.derivedStatus,'stale');assert.equal(stale.nextAction.id,'judge-full-suite');
}))));
test('A05 CE history contains exact source, compiler stderr and submitted testcase evidence',async()=>withJudge(()=>problem(id=>server(async req=>{
 const code='int main(){ syntax_error; }\n';await req('POST','/api/problems/'+id+'/judge',{code});const h=(await req('GET','/api/problems/'+id+'/history')).data.history;assert.equal(h[0]?.code,code);assert.equal(h[0]?.compile?.stderr,'main.cpp:1: error: AUDIT_EXACT_COMPILER_ERROR\n');assert.equal(h[0]?.inputSnapshot?.tests?.[0]?.expected,'5\n');assert.match(h[0]?.judgeFingerprint||'',/^[a-f0-9]{64}$/);
})), 'CE'));
test('A01 reference CE leaves AI output candidate, outside automatically trusted judge suite',async()=>problem(id=>server(async req=>{
 const old={generateTests:ai.generateTests,helper:ai.generateHelper,check:runCpp.checkCompiler,compile:runCpp.compileStandalone,cleanup:runCpp.cleanupWorkdir};
 ai.generateTests=async()=>({tests:[{name:'wrong AI',input:'4 5\n',expected:'999',expectedKnown:true}],notes:[]});ai.generateHelper=async()=> 'int main(){ syntax_error; }';runCpp.checkCompiler=async()=>({available:true});runCpp.compileStandalone=async()=>({ok:false,stderr:'fixture CE',workdir:'fixture-not-created'});runCpp.cleanupWorkdir=async()=>{};
 try{await settings.saveAiSettings({apiKey:'audit-fixture-only',baseUrl:'http://127.0.0.1:1/v1'});const generated=await req('POST','/api/ai/generate-tests',{problemId:id,statement:'sum two numbers',code:'int main(){}'});assert.equal(generated.status,200);const tests=(await req('GET','/api/problems/'+id+'/tests')).data.tests;const candidate=tests.find(t=>t.generatedBy==='ai');assert.ok(candidate);assert.equal(candidate.oracle?.state,'candidate');
  let inputs;const prior=judge.compileAndJudge;judge.compileAndJudge=async args=>{inputs=args.tests;return fakeJudge()(args)};try{await req('POST','/api/problems/'+id+'/judge',{});assert.equal(inputs.some(t=>t.expected==='999'),false)}finally{judge.compileAndJudge=prior}
 }finally{ai.generateTests=old.generateTests;ai.generateHelper=old.helper;runCpp.checkCompiler=old.check;runCpp.compileStandalone=old.compile;runCpp.cleanupWorkdir=old.cleanup;await settings.saveAiSettings({clearKey:true})}
})));
test('A06 file-mode output is bounded just like stdout',async()=>{
 const settings=await require('../src/settingsStore').getSettings();assert.equal((await runCpp.checkCompiler(settings)).available,true,'prepared compiler must work; do not skip');
 const code='#include <fstream>\n#include <string>\nint main(){std::ofstream f("audit.out");std::string b(1000,\'A\');for(int i=0;i<1100;++i)f<<b;}';const built=await runCpp.compileStandalone({code,settings});try{assert.equal(built.ok,true,built.stderr);const r=await runCpp.runBinary({binaryPath:built.binaryPath,input:'',timeMs:2000,fileMode:{name:'audit'}});assert.ok(Buffer.byteLength(r.stdout)<=LIMITS.maxOutputBytes);assert.equal(r.status,'RE');assert.equal(r.errorCode,'OUTPUT_LIMIT')}finally{await runCpp.cleanupWorkdir(built.workdir)}
});
test('A07 provider error never exposes configured dummy secret in message or providerMessage',async()=>{
 const key='audit-SECRET-fixture-123';const s=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Bad Bearer '+key}}))})});await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await assert.rejects(()=>ai.testConnection({apiKey:key,model:'fixture',baseUrl:`http://127.0.0.1:${s.address().port}/v1`}),e=>!e.message.includes(key)&&!String(e.providerMessage).includes(key))}finally{await new Promise(r=>s.close(r))}
});
test('A09 invalid testId is rejected before any filesystem call',async()=>{
 const old={remove:fileStore.removeFile,read:fileStore.readJson};let touches=0;fileStore.removeFile=async()=>{touches++};fileStore.readJson=async()=>{touches++;throw Error('FILESYSTEM_TOUCHED')};try{for(const id of ['../outside','a/b','a\\b','..','CON','01:stream','%2fescape','']){await assert.rejects(()=>problemStore.deleteTest('safe-problem',id),e=>e.status===400);assert.equal(touches,0)}}finally{fileStore.removeFile=old.remove;fileStore.readJson=old.read}
});
