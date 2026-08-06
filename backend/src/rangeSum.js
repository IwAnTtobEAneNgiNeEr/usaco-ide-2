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
using namespace std;

// Trong bài thi em thường viết tất cả trong main().
// Ở Xưởng, main() đã nằm trong file demo/test; file này chỉ giữ phần xử lý
// để nhiều nơi có thể gọi lại mà không chép lại thuật toán.

// PHẦN 1: Nhận mảng ban đầu rồi dựng mảng cộng dồn.
RangeSum::RangeSum(vector<long long> values) : values_(move(values)) {
  rebuild();
}

void RangeSum::rebuild() {
  prefix_.assign(values_.size() + 1, 0);
  for (size_t index = 0; index < values_.size(); ++index) {
    prefix_[index + 1] = prefix_[index] + values_[index];
  }
}

// PHẦN 2: Các hàm truy vấn đã hoạt động; em không cần sửa chúng ở build này.
size_t RangeSum::size() const {
  return values_.size();
}

long long RangeSum::queryZeroBased(size_t left, size_t right) const {
  if (left > right || right >= values_.size()) {
    throw out_of_range("invalid zero-based range");
  }
  return prefix_[right + 1] - prefix_[left];
}

long long RangeSum::queryOneBased(size_t left, size_t right) const {
  if (left == 0 || left > right || right > values_.size()) {
    throw out_of_range("invalid one-based range");
  }
  return prefix_[right] - prefix_[left - 1];
}

// PHẦN 3: VIỆC CỦA EM.
// Em chỉ viết trong hàm này. rebuild() là helper đã có sẵn ở PHẦN 1.
bool RangeSum::updateZeroBased(size_t index, long long value) {
  // TODO Xưởng 01.1 — nếu index nằm ngoài values_, return false.

  // TODO Xưởng 01.2 — ghi value mới vào đúng phần tử của values_.

  // TODO Xưởng 01.3 — gọi rebuild() để prefix_ khớp dữ liệu mới.

  // TODO Xưởng 01.4 — cập nhật hợp lệ thì return true.
  return false;
}
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
const HIDDEN_BASELINE_TEST = `#include "RangeSum.hpp"
#include <iostream>
int main(){RangeSum s({-5,10,-2,7});if(s.queryZeroBased(0,3)!=10)return 1;if(s.queryZeroBased(1,2)!=8)return 2;if(s.queryOneBased(4,4)!=7)return 3;if(s.queryZeroBased(0,3)!=10)return 4;std::cout<<"OK\\n";}
`;
const HIDDEN_CHANGE_TEST = `#include "RangeSum.hpp"
#include <iostream>
int main(){RangeSum s({1,2,3});if(!s.updateZeroBased(0,10)||s.queryZeroBased(0,2)!=15)return 1;if(!s.updateZeroBased(2,-3)||s.queryOneBased(2,3)!=-1)return 2;if(s.updateZeroBased(3,0))return 3;std::cout<<"OK\\n";}
`;

function buildScaffold({ problemId, sourceTitle, evidence, createdAt }) {
  return { manifest: {
    version:1,id:ARTIFACT_ID,title:"RangeSum",provider:"local",collection:"verified-artifact-modules",origin:"derived",activityKind:"algorithm-module",track:"algorithm-engineering",concept:"prefix-sum",
    derivedFrom:{problemId,sourceTitle,evidenceId:evidence.id,runId:evidence.runId,codeHash:evidence.codeHash,inputHash:evidence.inputHash},createdAt,updatedAt:createdAt,currentRequirementId:BASELINE_REQUIREMENT,
    requirements:[{id:BASELINE_REQUIREMENT,status:"active",summary:"Immutable 1D inclusive sums with explicit 0/1-based APIs."},{id:CHANGE_REQUIREMENT,status:"proposed",summary:"Point update followed by correct range queries."}],
    checks:{baseline:{requirementId:BASELINE_REQUIREMENT,testFile:"RangeSum.test.cpp"},"requirement-change":{requirementId:CHANGE_REQUIREMENT,testFile:"RangeSum.requirement-change.test.cpp"}},
  },files:{"RangeSum.hpp":HEADER,[SOURCE_FILE]:SOURCE,"RangeSum.test.cpp":BASELINE_TEST,"RangeSum.requirement-change.test.cpp":CHANGE_TEST} };
}
function composeTranslationUnit(files,suite){const testFile=suite==="requirement-change"?"RangeSum.requirement-change.test.cpp":"RangeSum.test.cpp";const strip=(text)=>String(text||"").replace(/^#include\s+"RangeSum\.hpp"\s*$/gm,"");return[files["RangeSum.hpp"],strip(files[SOURCE_FILE]),strip(files[testFile])].join("\n");}
function composeHiddenTranslationUnit(files,suite){const strip=(text)=>String(text||"").replace(/^#include\s+"RangeSum\.hpp"\s*$/gm,"");const test=suite==="requirement-change"?HIDDEN_CHANGE_TEST:HIDDEN_BASELINE_TEST;return[files["RangeSum.hpp"],strip(files[SOURCE_FILE]),strip(test)].join("\n");}
function latest(runs,suite){return(runs||[]).filter((r)=>r&&r.suite===suite).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]||null;}
function deriveStatus(manifest,runs,files){const suite=manifest.currentRequirementId===CHANGE_REQUIREMENT?"requirement-change":"baseline";const run=latest(runs,suite);if(!run)return suite==="baseline"?"unverified":"needs-work";if(run.verdict!=="AC")return"needs-work";if(files&&run.codeHash!==sourceHash(files,suite))return"needs-work";return"verified";}
function nextAction(manifest,runs,files){const status=deriveStatus(manifest,runs,files);if(manifest.currentRequirementId===CHANGE_REQUIREMENT)return status==="verified"?{id:"continue-from-derived",state:"evolve",label:"Continue from RangeSum",reason:"Point update passes."}:{id:"open-derived-work",state:"work",label:"Implement point update",reason:"Activated change does not pass yet."};return status==="verified"?{id:"activate-requirement-change",state:"evolve",label:"Open point-update requirement",reason:"Baseline passes."}:{id:"verify-derived-baseline",state:"verify",label:"Run module tests",reason:"Baseline needs verification."};}
function sourceHash(files,suite){return sha256(`${composeTranslationUnit(files,suite)}\n${composeHiddenTranslationUnit(files,suite)}`);}
module.exports={ARTIFACT_ID,SOURCE_FILE,FILE_NAMES,BASELINE_REQUIREMENT,CHANGE_REQUIREMENT,buildScaffold,composeTranslationUnit,composeHiddenTranslationUnit,deriveStatus,nextAction,sourceHash};
