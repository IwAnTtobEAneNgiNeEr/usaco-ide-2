"use strict";

const { sha256 } = require("./verifiedArtifact");
const ARTIFACT_ID = "range-sum-module";
const SOURCE_FILE = "RangeSum.cpp";
const BASELINE_REQUIREMENT = "one-dimensional-range-sum-v1";
const CHANGE_REQUIREMENT = "point-update-v2";
const FILE_NAMES = ["RangeSum.hpp", SOURCE_FILE, "RangeSum.test.cpp", "RangeSum.requirement-change.test.cpp"];

const HEADER = `#pragma once
#include <cstddef>
#include <vector>
class RangeSum {
 public:
  explicit RangeSum(std::vector<long long> values);
  std::size_t size() const;
  long long queryZeroBased(std::size_t left, std::size_t right) const;
  long long queryOneBased(std::size_t left, std::size_t right) const;
  bool updateZeroBased(std::size_t index, long long value);
 private:
  std::vector<long long> values_, prefix_;
  void rebuild();
};
`;
const SOURCE = `#include "RangeSum.hpp"
#include <stdexcept>
#include <utility>
RangeSum::RangeSum(std::vector<long long> values) : values_(std::move(values)) { rebuild(); }
void RangeSum::rebuild() { prefix_.assign(values_.size()+1,0); for(std::size_t i=0;i<values_.size();++i) prefix_[i+1]=prefix_[i]+values_[i]; }
std::size_t RangeSum::size() const { return values_.size(); }
long long RangeSum::queryZeroBased(std::size_t l,std::size_t r) const { if(l>r||r>=values_.size()) throw std::out_of_range("invalid zero-based range"); return prefix_[r+1]-prefix_[l]; }
long long RangeSum::queryOneBased(std::size_t l,std::size_t r) const { if(l==0||l>r||r>values_.size()) throw std::out_of_range("invalid one-based range"); return prefix_[r]-prefix_[l-1]; }
bool RangeSum::updateZeroBased(std::size_t,long long) { return false; /* TODO v2 */ }
`;
const BASELINE_TEST = `#include "RangeSum.hpp"
#include <iostream>
#include <stdexcept>
int main(){
  RangeSum s({3,-1,4,2,5}); if(s.size()!=5) return 1;
  if(s.queryZeroBased(0,0)!=3||s.queryZeroBased(0,4)!=13||s.queryZeroBased(1,3)!=5) return 2;
  if(s.queryOneBased(1,1)!=3||s.queryOneBased(1,5)!=13||s.queryOneBased(2,4)!=5) return 3;
  try{s.queryZeroBased(4,3);return 4;}catch(const std::out_of_range&){}
  try{s.queryOneBased(0,1);return 5;}catch(const std::out_of_range&){}
  RangeSum empty({}); try{empty.queryZeroBased(0,0);return 6;}catch(const std::out_of_range&){}
  std::cout<<"OK\\n";
}
`;
const CHANGE_TEST = `#include "RangeSum.hpp"
#include <iostream>
int main(){RangeSum s({2,4,8});bool ok=true;if(!s.updateZeroBased(1,10))ok=false;if(s.updateZeroBased(3,7))ok=false;if(s.queryZeroBased(0,2)!=20)ok=false;if(s.queryOneBased(2,3)!=18)ok=false;std::cout<<(ok?"OK\\n":"FAIL\\n");}
`;

function buildScaffold({ problemId, sourceTitle, evidence, createdAt }) {
  return { manifest: {
    version:1,id:ARTIFACT_ID,title:"RangeSum",provider:"local",collection:"verified-artifact-modules",origin:"derived",activityKind:"algorithm-module",concept:"prefix-sum",
    derivedFrom:{problemId,sourceTitle,evidenceId:evidence.runId,runId:evidence.runId,codeHash:evidence.codeHash,inputHash:evidence.inputHash},createdAt,updatedAt:createdAt,currentRequirementId:BASELINE_REQUIREMENT,
    requirements:[{id:BASELINE_REQUIREMENT,status:"active",summary:"Immutable 1D inclusive sums with explicit 0/1-based APIs."},{id:CHANGE_REQUIREMENT,status:"proposed",summary:"Point update followed by correct range queries."}],
    checks:{baseline:{requirementId:BASELINE_REQUIREMENT,testFile:"RangeSum.test.cpp"},"requirement-change":{requirementId:CHANGE_REQUIREMENT,testFile:"RangeSum.requirement-change.test.cpp"}},
  },files:{"RangeSum.hpp":HEADER,[SOURCE_FILE]:SOURCE,"RangeSum.test.cpp":BASELINE_TEST,"RangeSum.requirement-change.test.cpp":CHANGE_TEST} };
}
function composeTranslationUnit(files,suite){const testFile=suite==="requirement-change"?"RangeSum.requirement-change.test.cpp":"RangeSum.test.cpp";const strip=(text)=>String(text||"").replace(/^#include\s+"RangeSum\.hpp"\s*$/gm,"");return[files["RangeSum.hpp"],strip(files[SOURCE_FILE]),strip(files[testFile])].join("\n");}
function latest(runs,suite){return(runs||[]).filter((r)=>r&&r.suite===suite).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]||null;}
function deriveStatus(manifest,runs){const suite=manifest.currentRequirementId===CHANGE_REQUIREMENT?"requirement-change":"baseline";const run=latest(runs,suite);return run?(run.verdict==="AC"?"verified":"needs-work"):(suite==="baseline"?"unverified":"needs-work");}
function nextAction(manifest,runs){const status=deriveStatus(manifest,runs);if(manifest.currentRequirementId===CHANGE_REQUIREMENT)return status==="verified"?{id:"continue-from-derived",state:"evolve",label:"Continue from RangeSum",reason:"Point update passes."}:{id:"open-derived-work",state:"work",label:"Implement point update",reason:"Activated change does not pass yet."};return status==="verified"?{id:"activate-requirement-change",state:"evolve",label:"Open point-update requirement",reason:"Baseline passes."}:{id:"verify-derived-baseline",state:"verify",label:"Run module tests",reason:"Baseline needs verification."};}
function sourceHash(files,suite){return sha256(composeTranslationUnit(files,suite));}
module.exports={ARTIFACT_ID,SOURCE_FILE,FILE_NAMES,BASELINE_REQUIREMENT,CHANGE_REQUIREMENT,buildScaffold,composeTranslationUnit,deriveStatus,nextAction,sourceHash};
