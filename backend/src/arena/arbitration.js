"use strict";

// arbitration.js — pure core of "Phiên Tòa Test" (S12). Answers the one
// question a WA on an AI-generated test can never answer by itself: "code em
// sai, hay test sai?" A trusted reference (arena/referenceStore.js) is the
// only thing allowed to testify — if it isn't trusted, the court refuses to
// rule rather than guess.
//
// Pure: takes already-RUN results (reference/student outputs) and a compare
// function; no fs, no compiling here (that's the route's job, same split as
// autopsy/orchestrator.js's buildOracle vs ensureReference).

const VERDICTS = Object.freeze({
  UNVERIFIABLE: "unverifiable", // no trusted reference to ask — the court has no standing to rule
  BAD_TEST: "bad-test",         // the test's own expected output disagrees with the trusted reference
  STUDENT_WRONG: "student-wrong",
});

/**
 * @param {boolean} referenceTrusted - referenceStore.evaluateTrust(...).usable
 * @param {{status:string, stdout:string}} referenceResult - reference run on the test's input
 * @param {{status:string, stdout:string}} studentResult - student's current code run on the same input
 * @param {string} expectedFromTest - the test's OWN recorded expected output
 * @param {(a:string,b:string) => {ok:boolean}} compare - e.g. runCpp.compareOutput bound to a mode
 */
function judgeArbitration({ referenceTrusted, referenceResult, studentResult, expectedFromTest, compare }) {
  if (!referenceTrusted) {
    return { verdict: VERDICTS.UNVERIFIABLE, message: "Lời giải tham chiếu chưa được kiểm chứng — không đủ căn cứ để phán quyết. Tự xem lại nhé." };
  }
  if (!referenceResult || referenceResult.status !== "OK") {
    return { verdict: VERDICTS.UNVERIFIABLE, message: "Lời giải tham chiếu không chạy được trên test này — không đủ căn cứ để phán quyết." };
  }
  const refMatchesExpected = compare(expectedFromTest, referenceResult.stdout).ok;
  if (!refMatchesExpected) {
    return {
      verdict: VERDICTS.BAD_TEST,
      message: "Test này SAI — ngay cả lời giải tham chiếu (đã khớp sample chính thức) cũng không ra đáp án đang ghi trong test.",
      correctedExpected: referenceResult.stdout,
    };
  }
  const studentMatchesRef = studentResult && studentResult.status === "OK" && compare(referenceResult.stdout, studentResult.stdout).ok;
  if (studentMatchesRef) {
    return {
      verdict: VERDICTS.BAD_TEST,
      message: "Code em ĐÚNG theo lời giải tham chiếu — test này có đáp án ghi sai.",
      correctedExpected: referenceResult.stdout,
    };
  }
  return {
    verdict: VERDICTS.STUDENT_WRONG,
    message: "Code em sai — lời giải tham chiếu (đã khớp sample chính thức) ra một kết quả khác trên chính test này.",
  };
}

module.exports = { VERDICTS, judgeArbitration };
