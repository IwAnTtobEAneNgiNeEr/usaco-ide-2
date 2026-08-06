"use strict";

const runCpp = require("./runCpp");

function readable(value, fallback) {
  const content = String(value || "").trim();
  return (content || fallback).slice(0, 12000);
}

async function runProjectDemo({ plan, settings }) {
  let build = null;
  const startedAt = Date.now();
  try {
    build = await runCpp.compileProject({ files: plan.files, settings });
    if (!build.ok) {
      return {
        status: "failed",
        durationMs: Date.now() - startedAt,
        output: "",
        detail: readable(build.stderr, "Demo không biên dịch được nhưng compiler không trả chi tiết."),
      };
    }
    const run = await runCpp.runBinary({
      binaryPath: build.binaryPath,
      input: plan.input || "",
      timeMs: plan.timeMs || (settings && settings.timeMs),
    });
    if (run.status !== "OK") {
      return {
        status: "failed",
        durationMs: Date.now() - startedAt,
        output: readable(run.stdout, ""),
        detail: readable(run.stderr, `Demo dừng với trạng thái ${run.status}.`),
      };
    }
    return {
      status: "completed",
      durationMs: Date.now() - startedAt,
      output: readable(run.stdout, "Demo chạy xong nhưng chưa in kết quả."),
      detail: "Demo đã biên dịch và chạy bằng source hiện tại. Kết quả này dùng để quan sát sản phẩm, không phải bằng chứng nghiệm thu.",
    };
  } finally {
    if (build) await runCpp.cleanupWorkdir(build.workdir);
  }
}

module.exports = { runProjectDemo };
