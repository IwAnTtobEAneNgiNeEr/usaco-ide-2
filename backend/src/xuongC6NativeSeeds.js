"use strict";

// C6 native adapters are intentionally tiny but real C++ components.  Each
// pair belongs to one projection base and has separate source, oracle value
// and family id; the registry only admits a base when both members exist.
function definition({ id, base, family, className, sourceBody, input, expected }) {
  const headerName = `${className}.hpp`;
  const sourceName = `${className}.cpp`;
  const testName = `${className}.test.cpp`;
  return {
    ARTIFACT_ID: id,
    SOURCE_FILE: sourceName,
    C6_ADAPTER: { base, family, className, input, expected },
    buildScaffold({ createdAt } = {}) {
      const at = createdAt || new Date().toISOString();
      const header = `#pragma once\nclass ${className} { public: static int evaluate(int value); };\n`;
      const source = `#include "${headerName}"\nint ${className}::evaluate(int value) {\n${sourceBody}\n}\n`;
      const test = `#include "${headerName}"\n#include <iostream>\nint main(){ if(${className}::evaluate(${input}) != ${expected}) return 1; std::cout << "OK\\n"; }\n`;
      return {
        manifest: { version: 1, id, title: className, concept: family, currentRequirementId: "baseline-v1", requirements: [{ id: "baseline-v1", status: "active", summary: `Native ${base} adapter.` }], createdAt: at, updatedAt: at },
        files: { [headerName]: header, [sourceName]: source, [testName]: test, [`${className}.requirement-change.test.cpp`]: test },
      };
    },
    composeHiddenTranslationUnit(files, suite) {
      const strip = (value) => String(value || "").replace(new RegExp(`^#include\\s+"${headerName.replace(".", "\\.")}"\\s*$`, "gm"), "");
      const testFile = suite === "requirement-change" ? `${className}.requirement-change.test.cpp` : testName;
      return [files[headerName], strip(files[sourceName]), strip(files[testFile])].join("\n");
    },
  };
}

const c6Definitions = [
  definition({ id: "tree-depth-index", base: "tree", family: "binary-tree-depth", className: "TreeDepthIndex", input: 13, expected: 3, sourceBody: "  int depth=0; while(value>1){ value/=2; ++depth; } return depth;" }),
  definition({ id: "trie-prefix-index", base: "tree", family: "trie-prefix", className: "TriePrefixIndex", input: 1203, expected: 4, sourceBody: "  int digits=1; while(value>=10){ value/=10; ++digits; } return digits;" }),
  definition({ id: "interval-timeline", base: "timeline", family: "interval-scheduling", className: "IntervalTimeline", input: 7, expected: 21, sourceBody: "  int total=0; for(int tick=0; tick<value; ++tick) total += tick; return total;" }),
  definition({ id: "event-sweep-timeline", base: "timeline", family: "event-sweep", className: "EventSweepTimeline", input: 7, expected: 1, sourceBody: "  int active=0; for(int tick=0; tick<value; ++tick) active += (tick%2==0 ? 1 : -1); return active;" }),
  definition({ id: "manhattan-geometry", base: "geometry", family: "manhattan-path", className: "ManhattanGeometry", input: 9, expected: 9, sourceBody: "  return value < 0 ? -value : value;" }),
  definition({ id: "rectangle-geometry", base: "geometry", family: "rectangle-area", className: "RectangleGeometry", input: 5, expected: 25, sourceBody: "  return value * value;" }),
  definition({ id: "request-queue-adapter", base: "request-response", family: "request-queue", className: "RequestQueueAdapter", input: 8, expected: 4, sourceBody: "  return value / 2;" }),
  definition({ id: "response-window-adapter", base: "request-response", family: "response-window", className: "ResponseWindowAdapter", input: 8, expected: 3, sourceBody: "  return value % 5;" }),
  definition({ id: "memory-budget-adapter", base: "runtime-resource", family: "memory-budget", className: "MemoryBudgetAdapter", input: 12, expected: 3, sourceBody: "  int pages=0; while(value>0){ value-=4; ++pages; } return pages;" }),
  definition({ id: "cpu-quota-adapter", base: "runtime-resource", family: "cpu-quota", className: "CpuQuotaAdapter", input: 10, expected: 2, sourceBody: "  int quota=0; for(int unit=0; unit<value; unit+=5) ++quota; return quota;" }),
  definition({ id: "toggle-state-machine", base: "state-machine", family: "toggle-transition", className: "ToggleStateMachine", input: 7, expected: 1, sourceBody: "  int state=0; for(int step=0; step<value; ++step) state=1-state; return state;" }),
  definition({ id: "retry-state-machine", base: "state-machine", family: "retry-transition", className: "RetryStateMachine", input: 7, expected: 3, sourceBody: "  int retries=0; while(value>1){ value=(value+1)/2; ++retries; } return retries;" }),
];

module.exports = { c6Definitions };
