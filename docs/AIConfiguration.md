# AI Configuration

All AI features are **optional**. The IDE, judge, Lab, and Visualizer work with no key.

## Add a key

1. Open the **Settings** tab (right panel) → **AI** section.
2. Paste your **API key** and click **Detect** — the app probes the key and fills in the
   provider, **Base URL**, and a suggested **Model**. (Or fill them by hand.)
3. Click **Save AI settings**, then **Test connection**.

Your key is stored **only** in `data/ai-settings.json`, which is gitignored and never
logged. The UI only ever shows *whether* a key is set, never the key itself.

## Fields

| Field | Example | Notes |
|-------|---------|-------|
| API key | `sk-…` / `AIza…` | Stored locally only. |
| Base URL | `https://api.openai.com/v1` | Any OpenAI-compatible Chat Completions endpoint. |
| Model | `gpt-4.1-mini` | The primary model. |
| Fallback models | `gemini-2.0-flash, gemini-2.5-flash-lite` | Comma-separated; tried in order on rate-limit (429) / overload. |

## How requests behave

- **Cancellable** — a global "AI đang chạy… ✕ Hủy" pill cancels everything in flight; each
  feature's own ⏹ Stop cancels just its request.
- **Resilient** — on 429 / 5xx the client retries with exponential backoff, then rolls over
  to the next fallback model.
- **Cached** — analysis, contests, editorials, and the harder-variant payload are cached on
  disk (by statement hash), so re-opening a problem spends no tokens.
- **Friendly errors** — a rejected key, exhausted quota, or wrong model returns a clear
  message pointing you back to Settings, with the provider's raw text in parentheses.

## What the AI is used for

| Feature | Endpoint |
|---------|----------|
| OCR cleanup (fix diacritics after local OCR) | `POST /api/ai/ocr` |
| Statement analysis + auto-fill metadata | `POST /api/ai/analyze`, `/process` |
| Test-case generation (with execution-based verification) | `POST /api/ai/generate-tests` |
| Leveled hints (no spoilers) | `POST /api/ai/hint` |
| Coach chat (streaming) | `POST /api/ai/chat-stream` |
| WA diagnosis → `mistakes.md` | `POST /api/ai/review-mistakes` |
| Auto-Fix (suggested code patches) | `POST /api/ai/auto-fix` |
| Explain Your Solution (post-AC Q&A) | `POST /api/ai/defense-questions`, `/defense-grade` |
| Stress-test generator / brute helper | `POST /api/ai/gen-helper` |
| AI Contest Generator | `POST /api/contests/generate` |

## Privacy

Requests go **only** to the base URL you configure. There is no other telemetry. When you
use an AI feature, the relevant statement/code is sent to *your* provider — don't paste
anything you wouldn't share with them.

See also: [Troubleshooting.md](Troubleshooting.md#ai).
