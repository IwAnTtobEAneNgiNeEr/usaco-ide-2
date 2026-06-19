# Test Generation

Two complementary ways to build a strong test suite.

## Import existing tests (`.in` / `.out`)

In the **Tests** tab, click **📂 Import .in/.out** or **drag a whole downloaded test-data
folder onto the tab**. Files are paired by stem (`1.in` ↔ `1.out`; `.ans` / `.expected` are
accepted as the answer side), numerically sorted, and added in one shot. Oversized files are
skipped with a report — never fatal.

## Generate with AI

Click **✨ Generate with AI** (Tests tab) or **✨ Tạo test ngay** (Problem view). The AI:

1. **Solves** the problem itself to know the answers.
2. **Designs** diverse cases across categories: samples, min-boundary, small-random,
   duplicates, sorted, reverse, extreme values, constraint-limit, corner, adversarial,
   overflow, and precision.
3. **Verifies** every expected output, ideally by *executing* an AI reference solution
   against your compiler (best-effort).

A preview dialog opens where you can:
- check/uncheck which tests to keep,
- edit **name / input / expected**,
- read each test's *reason*.

Click **Apply selected** to write them into `tests/` (tagged `AI`).

### ⚠ Always review AI tests

The AI can be **wrong about expected output**. When it isn't confident it marks a test
**NO EXPECTED** (input-only) and adds a warning instead of guessing. Before trusting AI
tests, re-run a solution you *know* is correct and confirm the outputs.

## Verify outputs the safe way

The surest validation is the **Stress Lab** (see [LocalJudge.md](LocalJudge.md#stress-lab)):
generate random inputs and compare your solution against a simple brute force. If they ever
disagree, you've found a real bug — no AI guessing involved.

## Save a one-off test

In the **Run** tab, after entering custom input/expected, click **Save as test** to add the
current case to the suite.
