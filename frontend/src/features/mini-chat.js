// mini-chat.js — AI Coach. A scoped, per-problem Q&A panel, available as soon as
// a problem is open (no timer gate — help should be one click away for CP use).
// Conversation is persisted per problem (chat.json) and context is windowed
// server-side, so token use stays small. The AI answers only within this problem
// and, by default, never hands over a full solution unless "Cho xem lời giải" is on.

import { api } from "../api.js?v=2.2";
import { escapeHtml, renderMarkdown, renderMath } from "../md.js?v=2.2";
import { highlightCpp } from "../highlight.js?v=2.2";

// User turns stay plain: escape + `code` + **bold** + line breaks. Nothing fancy —
// it's the student's own text, so keyword/section enhancement would be noise.
function renderUserText(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// ---- AI turn rendering: structure, code, keywords, risk badges --------------
// The AI emits free-form Markdown. We render it with the shared (sanitized)
// Markdown renderer for real hierarchy, then progressively enhance:
//   • fenced code → syntax-highlighted block with a Copy button
//   • known section labels (Hint / Observation / Mistake / Fix / Next step) → cards
//   • CP techniques (DP, BFS, Two Pointers…) → highlighted chips
//   • a risk/confidence strip parsed from the text (only shown when present)
// All enhancement runs on already-sanitized HTML / real text nodes, so no raw
// model output ever reaches innerHTML unescaped.

const COACH_KEYWORDS = [
  "binary indexed tree", "two pointers", "sliding window", "segment tree", "fenwick tree",
  "hash set", "hash map", "union find", "disjoint set", "prefix sum", "priority queue",
  "topological sort", "shortest path", "dynamic programming", "monotonic stack",
  "monotonic queue", "sqrt decomposition", "bitmask", "backtracking", "memoization",
  "dijkstra", "bellman-ford", "kruskal", "trie", "greedy", "binary search",
  "dfs", "bfs", "dp", "kmp", "gcd", "lcm"
];
const KW_RE = new RegExp("\\b(" + COACH_KEYWORDS.map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|") + ")\\b", "gi");

const SECTIONS = [
  // Lead punchline — first line of every answer (the conclusion, made prominent).
  { re: /^(chẩn đoán|chan doan|kết luận|ket luan)\b/i, cls: "diag", icon: "🩺" },
  { re: /^(trả lời nhanh|tra loi nhanh|tóm lại|tom lai|chốt lại|chốt)\b/i, cls: "sum", icon: "⚡" },
  { re: /^(hint|gợi ý|gợi y|ý tưởng|y tuong)\b/i, cls: "hint", icon: "💡" },
  { re: /^(approach|hướng tiếp cận|cách tiếp cận|huong tiep can)\b/i, cls: "approach", icon: "🧭" },
  { re: /^(observation|nhận xét|quan sát)\b/i, cls: "obs", icon: "🔍" },
  { re: /^(mistake|lỗi sai|lỗi tư duy|lỗi|sai lầm|sai sót thường gặp|sai sót)\b/i, cls: "mistake", icon: "❌" },
  { re: /^(bằng chứng|bang chung|ví dụ phản chứng|phản ví dụ|counter-example|counterexample)\b/i, cls: "evid", icon: "🔬" },
  { re: /^(suggested fix|cách sửa|hướng sửa|sửa lỗi|fix)\b/i, cls: "fix", icon: "✅" },
  { re: /^(next step|bước tiếp theo|tiếp theo)\b/i, cls: "next", icon: "📌" },
  { re: /^(current step|bước hiện tại)\b/i, cls: "cur", icon: "📍" },
  { re: /^(final goal|mục tiêu cuối|mục tiêu)\b/i, cls: "goal", icon: "🎯" }
];

function unescapeEntities(s) {
  return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

// Replace md.js's <pre class="md-pre"><code>…</code></pre> with a richer block:
// a header (lang + Copy) and a syntax-highlighted body. The body is highlighted
// with the same C++ tokenizer the editor uses (highlightCpp re-escapes).
function enhanceCodeBlocks(html) {
  return html.replace(/<pre class="md-pre"><code>([\s\S]*?)<\/code><\/pre>/g, (_m, inner) => {
    const src = unescapeEntities(inner);
    const looksCpp = /[;{}#]|std::|int |cout|cin|vector|for\s*\(/.test(src);
    const body = looksCpp ? highlightCpp(src) : escapeHtml(src);
    return `<div class="coach-code"><div class="coach-code-bar"><span class="coach-code-lang">${looksCpp ? "cpp" : "text"}</span>` +
      `<button type="button" class="coach-copy">Copy</button></div>` +
      `<pre class="coach-code-pre"><code>${body}</code></pre></div>`;
  });
}

// A small risk/confidence strip, parsed from the raw text. Only badges that the
// text actually warrants are shown — we never fabricate a confidence level.
function buildBadges(text) {
  const t = text.toLowerCase();
  const out = [];
  if (/potential\s*tle|tle|time limit|quá thời gian|quá giờ|too slow/.test(t)) out.push(["warn-tle", "⏱ Có thể TLE"]);
  if (/potential\s*wa|wrong answer|\bwa\b|sai đáp án|sai kết quả/.test(t)) out.push(["warn-wa", "✕ Có thể WA"]);
  if (/overflow|tràn số|tràn kiểu|long long/.test(t)) out.push(["warn-of", "∑ Nguy cơ tràn số"]);
  if (/\bmle\b|memory limit|tràn bộ nhớ|out of memory/.test(t)) out.push(["warn-mem", "▤ Nguy cơ bộ nhớ"]);
  
  const progressMatch = text.match(/(?:progress|tiến độ):\s*(\d+\/\d+)/i);
  if (progressMatch) {
    out.push(["warn-progress", `📈 Tiến độ: ${progressMatch[1]}`]);
  }

  let conf = "";
  if (/high confidence|khá chắc|chắc chắn|rất có thể/.test(t)) conf = ["conf-high", "● Độ tin cậy cao"];
  else if (/low confidence|không chắc|chưa chắc|có lẽ|đoán/.test(t)) conf = ["conf-low", "● Độ tin cậy thấp"];
  else if (/medium confidence|tương đối/.test(t)) conf = ["conf-med", "● Độ tin cậy vừa"];
  if (conf) out.push(conf);
  if (!out.length) return "";
  return `<div class="coach-badges">` +
    out.map(([c, l]) => `<span class="coach-badge ${c}">${l}</span>`).join("") + `</div>`;
}

// Wrap CP technique terms in real text nodes (never inside code / links).
function highlightKeywords(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === "CODE" || tag === "PRE" || tag === "A" || p.classList.contains("coach-kw")) return NodeFilter.FILTER_REJECT;
      return KW_RE.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);
  for (const node of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const text = node.nodeValue;
    KW_RE.lastIndex = 0;
    let m;
    while ((m = KW_RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement("span");
      span.className = "coach-kw";
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

// Group flat HTML elements into styled collapsible section cards.
function groupSectionsIntoCards(root) {
  const children = Array.from(root.children);
  let currentCard = null;
  let currentBody = null;

  children.forEach((el) => {
    const isHeading = ["H1","H2","H3","H4","H5","H6"].includes(el.tagName);
    let sec = null;
    let titleText = "";

    if (isHeading) {
      titleText = (el.textContent || "").trim();
      titleText = titleText.replace(/^#+\s*/, "");
      sec = SECTIONS.find((s) => s.re.test(titleText));
    } else if (el.tagName === "P") {
      const strong = el.querySelector("strong:first-child");
      if (strong && el.firstChild === strong) {
        titleText = (strong.textContent || "").trim();
        titleText = titleText.replace(/:\s*$/, "");
        sec = SECTIONS.find((s) => s.re.test(titleText));
        if (sec) {
          strong.remove();
          if (!el.textContent.trim()) {
            el.remove();
            el = null;
          }
        }
      }
    }

    if (sec) {
      currentCard = document.createElement("div");
      currentCard.className = `coach-card-sec coach-card-sec-${sec.cls}`;

      const headerEl = document.createElement("div");
      headerEl.className = "coach-card-header";
      headerEl.dataset.icon = sec.icon;
      headerEl.innerHTML = `<span>${sec.icon}</span><span>${titleText}</span>`;

      currentCard.appendChild(headerEl);

      currentBody = document.createElement("div");
      currentBody.className = "coach-card-body";
      currentCard.appendChild(currentBody);

      root.insertBefore(currentCard, el || null);

      if (isHeading) {
        el.remove();
      } else if (el) {
        currentBody.appendChild(el);
      }
    } else {
      if (currentCard && currentBody && el) {
        currentBody.appendChild(el);
      }
    }
  });
}

function renderAi(text) {
  return buildBadges(text) + enhanceCodeBlocks(renderMarkdown(text));
}

// Set an AI bubble's content + run all DOM enhancements. Used by both the
// streaming painter and the final/persisted render. `opts.math === false` skips
// KaTeX rendering — during the paced reveal the LaTeX is still half-streamed, so
// rendering it every frame both garbles output and is the most expensive step;
// we defer math to the final, complete frame.
function setAiContent(bubbleEl, text, opts) {
  bubbleEl.innerHTML = renderAi(text);
  try {
    highlightKeywords(bubbleEl);
    groupSectionsIntoCards(bubbleEl);
    if (!opts || opts.math !== false) renderMath(bubbleEl);
  } catch (err) {
    console.error("Enhancement failed:", err);
  }
}

export function initMiniChat(app) {
  const chatEl = document.getElementById("coach-chat");
  const messagesEl = document.getElementById("coach-messages");
  const inputEl = document.getElementById("coach-input");
  const sendBtn = document.getElementById("coach-send");
  const clearBtn = document.getElementById("coach-clear");
  const revealEl = document.getElementById("coach-reveal");
  if (!chatEl || !messagesEl) return;

  // The Coach defaults to HINTS-ONLY every session. Non-spoiler guidance is the whole
  // point of the tool, so revealing full solutions is a deliberate per-session opt-in
  // (it does NOT persist on). Turning it on states the consequence explicitly — a
  // toast, not a blocking confirm.
  if (revealEl) {
    revealEl.checked = false;
    revealEl.addEventListener("change", () => {
      if (revealEl.checked) {
        app.toast("Đã bật Lời giải — AI có thể đưa code / đáp án đầy đủ. Tắt để quay lại chỉ gợi ý.", "ok");
      }
    });
  }

  // Copy buttons on AI code blocks (event-delegated; survives re-renders).
  messagesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".coach-copy");
    if (!btn) return;
    const block = btn.closest(".coach-code");
    const pre = block && block.querySelector(".coach-code-pre");
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      btn.textContent = "Copied ✓";
      btn.classList.add("done");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1400);
    }).catch(() => app.toast("Không copy được", "err"));
  });

  // Collapsible section headers for AI Coach response sections (event-delegated).
  messagesEl.addEventListener("click", (e) => {
    const header = e.target.closest(".coach-card-header");
    if (!header) return;
    const card = header.closest(".coach-card-sec");
    if (card) card.classList.toggle("collapsed");
  });

  // Always available — the Coach is scoped + spoiler-guarded, so there's no
  // timer gate. (No lock overlay; the chat is shown from the start.)
  let sending = false;
  // Per-message abort controller: cancelling here aborts ONLY this chat request,
  // never the parallel statement→test pipeline. (See aiCall's two-tier note.)
  let chatAbort = null;
  const sendLabel = sendBtn ? sendBtn.textContent : "Gửi";

  // While a reply is pending the Send button becomes a Stop button that aborts
  // just this turn; it reverts to "Gửi" when the turn settles.
  function setSendMode(mode) {
    if (!sendBtn) return;
    if (mode === "stop") {
      sendBtn.textContent = "⏹ Dừng";
      sendBtn.classList.add("coach-stop");
      sendBtn.title = "Dừng câu trả lời này (không ảnh hưởng tác vụ AI khác)";
    } else {
      sendBtn.textContent = sendLabel;
      sendBtn.classList.remove("coach-stop");
      sendBtn.title = "";
    }
  }

  function renderHistory(turns) {
    const v = latestVerdict();
    const hasStatement = (app.state.meta && app.state.meta.analysis) ? "đã lưu" : "có thể suy luận từ code";
    const header = `<div style="font-size: 11.5px; color: var(--text-dim); text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed var(--border);">🧠 Đã nắm rõ Đề bài (${hasStatement}) & Code. Kết quả gần nhất: <b>${v}</b></div>`;

    if (!turns || !turns.length) {
      messagesEl.innerHTML = header + `<div class="coach-empty">Bạn cần gợi ý gì? Gõ câu hỏi, hoặc bấm một nút nhanh bên dưới — <b>💡 Gợi ý nhẹ</b> · <b>🧭 Hướng tiếp cận</b> · <b>❓ Vì sao WA</b>.<br>Bật <b>Lời giải</b> ở góc trên nếu muốn AI viết/sửa code. Mẹo: <kbd>Alt+W</kbd> phóng to khung để đọc dễ hơn.</div>`;
      return;
    }
    messagesEl.innerHTML = header + turns.map((t) => {
      const who = t.role === "assistant" ? "ai" : "me";
      const inner = t.role === "assistant" ? renderAi(t.content) : renderUserText(t.content);
      return `<div class="coach-msg coach-msg-${who}"><div class="coach-bubble">${inner}</div></div>`;
    }).join("");
    messagesEl.querySelectorAll(".coach-msg-ai .coach-bubble").forEach((el) => {
      try { highlightKeywords(el); groupSectionsIntoCards(el); renderMath(el); } catch { /* best-effort */ }
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendBubble(role, html, cls = "") {
    const who = role === "assistant" ? "ai" : "me";
    const div = document.createElement("div");
    div.className = `coach-msg coach-msg-${who}`;
    div.innerHTML = `<div class="coach-bubble ${cls}">${html}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  // Latest verdict (compact) so the AI grounds answers in what actually ran.
  function latestVerdict() {
    const h = app.state.meta && app.state.meta.history && app.state.meta.history[0];
    if (!h) return "(chưa chạy)";
    return `${h.verdict || h.type}${h.passed != null ? ` ${h.passed}/${h.total} pass` : ""}`;
  }

  // Recent submission timeline (newest first, capped at 5) so the Coach sees HOW
  // MANY times the student retried and roughly what failed — not just the last
  // verdict. meta.history is lightweight (no stdout/stderr); the backend enriches
  // each run with its saved error logs, so here we send only verdict/score/error.
  function recentRunHistory() {
    const hist = (app.state.meta && app.state.meta.history) || [];
    return hist.slice(0, 5).map((h) => ({
      verdict: h.verdict || h.type,
      passed: h.passed != null ? h.passed : null,
      total: h.total != null ? h.total : null,
      timeMs: h.timeMs != null ? h.timeMs : null,
      error: h.error ? String(h.error).slice(0, 400) : ""
    }));
  }

  // Per-test results from the most recent judge run (expected vs actual + stderr
  // per test). This gives the Coach concrete diff data to reason about.
  function currentPerTestResults() {
    const map = app.state.testResults || {};
    const tests = app.state.tests || [];
    const results = [];
    for (const t of tests) {
      const r = map[t.id];
      if (!r) continue;
      const entry = { id: t.id, name: t.name || t.id, status: r.status };
      if (r.timeMs != null) entry.timeMs = r.timeMs;
      if (r.diff) entry.diff = { line: r.diff.line, expected: String(r.diff.expected).slice(0, 150), actual: String(r.diff.actual).slice(0, 150) };
      else if (r.actual != null && r.status !== "AC") entry.actual = String(r.actual).slice(0, 250);
      if (r.stderr) entry.stderr = String(r.stderr).slice(0, 350);
      results.push(entry);
    }
    return results.length ? results : undefined;
  }

  // `textOverride` lets quick-action buttons send a canned prompt through the
  // exact same path (same context, persistence and Stop button) as typed input.
  async function send(textOverride) {
    if (sending) return;
    const msg = (textOverride != null ? String(textOverride) : inputEl.value).trim();
    if (!msg) return;
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    const pid = app.state.currentId;

    sending = true;
    chatAbort = new AbortController();
    setSendMode("stop");
    if (textOverride == null) inputEl.value = "";
    const emptyHint = messagesEl.querySelector(".coach-empty");
    if (emptyHint) emptyHint.remove();
    appendBubble("user", renderUserText(msg));
    const thinking = appendBubble("assistant", `<span class="spinner"></span> đang nghĩ…`, "coach-thinking");

    // ---- Paced reveal -------------------------------------------------------
    // Mercury (a diffusion model) often returns the whole answer almost at once.
    // Painting it instantly makes a long reply impossible to read along with and
    // yanks the scroll to the bottom while the student is still reading the fix.
    // So we keep the full received text in `acc` but only DISPLAY `acc.slice(0,
    // shown)`, advancing `shown` at a calm, readable speed each frame. The pace
    // catches up after the stream ends; the student can click to reveal it all.
    const bubble = thinking.querySelector(".coach-bubble");
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let acc = "";            // everything received so far
    let shown = 0;           // chars currently painted
    let streamDone = false;  // upstream finished sending
    let skip = reduceMotion; // reveal instantly for reduced-motion users
    let rafId = 0;
    let lastT = 0;

    // Only follow the bottom if the student hasn't scrolled up to read.
    const nearBottom = () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 64;

    // "Reveal all now" affordance — a small pill + clicking the streaming bubble.
    let skipPill = document.createElement("button");
    skipPill.type = "button";
    skipPill.className = "coach-skip";
    skipPill.textContent = "⏭ Hiện hết";
    skipPill.title = "Hiện toàn bộ câu trả lời ngay";
    const revealAll = () => { skip = true; kick(); };
    const cleanup = () => {
      bubble.classList.remove("coach-streaming");
      bubble.removeEventListener("click", revealAll);
      if (skipPill) { skipPill.remove(); skipPill = null; }
    };
    if (!skip) {
      skipPill.addEventListener("click", revealAll);
      messagesEl.appendChild(skipPill); // sticky pill, pinned to the scroll viewport
      bubble.addEventListener("click", revealAll);
    }

    const pace = (now) => {
      rafId = 0;
      if (app.state.currentId !== pid) { cleanup(); return; }
      if (skip) {
        shown = acc.length;
      } else {
        const dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
        lastT = now;
        const backlog = acc.length - shown;
        // ~110 chars/s base, accelerating mildly so a long answer never drags.
        const cps = 110 * (1 + Math.min(backlog / 700, 4));
        shown = Math.min(acc.length, shown + Math.max(1, Math.ceil(cps * dt)));
      }
      const finished = streamDone && shown >= acc.length;
      bubble.classList.remove("coach-thinking");
      const wasBottom = nearBottom();
      setAiContent(bubble, acc.slice(0, shown), { math: finished });
      bubble.classList.toggle("coach-streaming", !finished);
      if (wasBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      if (shown < acc.length) {
        rafId = requestAnimationFrame(pace);
      } else if (finished) {
        cleanup();
        if (app.playSound) app.playSound("complete");
      }
      // caught up but stream not done → idle until next delta re-arms via kick().
    };
    function kick() { if (!rafId) { lastT = 0; rafId = requestAnimationFrame(pace); } }

    try {
      const res = await api.aiChatStream({
        problemId: pid,
        message: msg,
        revealAllowed: Boolean(revealEl && revealEl.checked),
        code: app.getEditorValue(),
        testResult: latestVerdict(),
        runHistory: recentRunHistory(),
        perTestResults: currentPerTestResults()
      }, {
        signal: chatAbort.signal,
        onDelta: (_d, full) => { acc = full; kick(); }
      });
      // Switched problems mid-flight: don't render A's reply into B's thread.
      // The turn is already persisted to A's chat.json server-side.
      if (app.state.currentId !== pid) { cleanup(); return; }
      acc = res.reply || acc || "(không có phản hồi)";
      streamDone = true;
      kick(); // let the pacer finish revealing, then it finalizes (sound, cleanup)
    } catch (err) {
      streamDone = true;
      cleanup();
      if (app.state.currentId !== pid) return;
      bubble.classList.remove("coach-thinking", "coach-streaming");
      if (err && err.aborted) {
        // Keep whatever already streamed — partial reasoning is still useful.
        const partial = err.partial || acc;
        if (partial) {
          setAiContent(bubble, partial);
          bubble.insertAdjacentHTML("beforeend", ` <span class="coach-err">⏹ (đã dừng)</span>`);
        } else {
          bubble.innerHTML = `<span class="coach-err">⏹ Đã dừng câu trả lời này.</span>`;
        }
      } else {
        bubble.innerHTML = `<span class="coach-err">${escapeHtml(err.message)}</span>`;
        if (err.data && err.data.code === "NO_KEY") { app.setTab("settings"); app.toast("Chưa có API key — mở Settings.", "err"); }
      }
    } finally {
      sending = false;
      chatAbort = null;
      setSendMode("send");
      inputEl.focus();
    }
  }

  // ---- Quick actions (canned prompts through the same send() path) ----
  // No new endpoints, no extra context: /chat already injects statement + code
  // + run history, so each button costs exactly one normal chat turn.

  const NUDGE_PROMPT =
    "Cho mình một cú hích NHẸ: chỉ ra quan sát mấu chốt của đề này mà mình có thể đang bỏ lỡ, hoặc một câu hỏi gợi mở để mình tự nghĩ tiếp — tối đa 2 câu, chưa nêu tên thuật toán, không viết code.";
  const APPROACH_PROMPT =
    "Bài này quy về dạng/kỹ thuật nào? Trả lời theo ĐÚNG định dạng nhãn in đậm:\n" +
    "**Trả lời nhanh:** tên kỹ thuật trong 1 câu.\n" +
    "**Hướng tiếp cận:** (a) kỹ thuật đó là gì, ngắn gọn; (b) vì sao khớp ĐÚNG ràng buộc của đề này (đừng nói chung chung); (c) minh họa nhanh bằng sample input của đề. Ưu tiên cách CƠ BẢN, dễ code. Không viết code.";
  const WHY_WA_PROMPT =
    "Code mình đang WA. ĐỪNG viết lại bài — hãy debug đúng code mình đang có. Trả lời theo ĐÚNG định dạng nhãn in đậm:\n" +
    "**Lỗi sai:** gọi tên lỗi tư duy mình đang mắc, 1 câu.\n" +
    "**Bằng chứng:** một input nhỏ cụ thể khiến code mình chạy sai — nó in ra gì so với đáp án đúng — và chỉ rõ dòng/biến gây ra.\n" +
    "**Hướng sửa:** nói bằng lời cần sửa gì. Không viết code sửa hộ.";

  // TLE prompt is built per click so it can carry the problem's constraints +
  // time limit (the AI then reasons complexity-vs-constraints, not vibes).
  function buildTlePrompt() {
    const meta = app.state.meta || {};
    const a = meta.analysis || {};
    let p = "Code mình đang TLE. Đừng viết lại bài. Trả lời theo ĐÚNG định dạng nhãn in đậm:\n" +
      "**Chẩn đoán:** chỉ đúng vòng lặp/đoạn nghẽn + độ phức tạp code hiện tại, 1 câu.\n" +
      "**Bằng chứng:** ước số phép tính theo ràng buộc của đề để cho thấy vì sao quá chậm.\n" +
      "**Hướng sửa:** độ phức tạp MỤC TIÊU cần đạt và ý tưởng tối ưu (ưu tiên tối ưu trên nền code hiện tại). Không viết code sửa hộ.";
    if (a.rangBuoc) p += `\nRàng buộc đề: ${a.rangBuoc}`;
    if (Number(meta.timeLimitMs) > 0) p += `\nGiới hạn thời gian: ${meta.timeLimitMs}ms`;
    return p;
  }

  const actionsRow = document.createElement("div");
  actionsRow.className = "coach-actions";
  actionsRow.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" data-qa="nudge" title="Một cú hích nhỏ, không lộ thuật toán">💡 Gợi ý nhẹ</button>
    <button type="button" class="btn btn-ghost btn-sm" data-qa="approach" title="Dạng bài / kỹ thuật phù hợp">🧭 Hướng tiếp cận</button>
    <button type="button" class="btn btn-ghost btn-sm" data-qa="why-wa" title="Phân tích vì sao đang Wrong Answer">❓ Vì sao WA?</button>
    <button type="button" class="btn btn-ghost btn-sm" data-qa="why-tle" title="Độ phức tạp hiện tại vs ràng buộc">🐢 Vì sao TLE?</button>
    <button type="button" class="btn btn-ghost btn-sm" data-qa="selection" title="Bôi đen code trong editor rồi bấm (Ctrl+Shift+E)">💬 Hỏi đoạn bôi đen</button>`;
  const composerEl = chatEl.querySelector(".coach-composer");
  chatEl.insertBefore(actionsRow, composerEl);

  actionsRow.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-qa]");
    if (!btn || sending) return;
    const kind = btn.dataset.qa;
    if (kind === "nudge") send(NUDGE_PROMPT);
    else if (kind === "approach") send(APPROACH_PROMPT);
    else if (kind === "why-wa") send(WHY_WA_PROMPT);
    else if (kind === "why-tle") send(buildTlePrompt());
    else if (kind === "selection") app.coachAskSelection();
  });

  // ---- public hooks on app ----

  // Highlight verdict-specific quick actions to match the latest run.
  // All buttons are always visible; the matching one gets an "active" highlight.
  app.refreshCoachActions = () => {
    const h = (app.state.meta && app.state.meta.history && app.state.meta.history[0]) || null;
    const v = h ? (h.verdict || h.type) : "";
    const waBtn = actionsRow.querySelector('[data-qa="why-wa"]');
    const tleBtn = actionsRow.querySelector('[data-qa="why-tle"]');
    waBtn.classList.toggle("coach-qa-active", v === "WA");
    tleBtn.classList.toggle("coach-qa-active", v === "TLE");
  };

  // Explain the selected code fragment in the Coach (Ctrl+Shift+E). Reuses the
  // chat turn — the server already sends full code; the selection adds focus.
  app.coachAskSelection = () => {
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    const ed = app.el.codeEditor;
    const sel = String(ed.value || "").slice(ed.selectionStart || 0, ed.selectionEnd || 0);
    if (!sel.trim()) { app.toast("Bôi đen một đoạn code trong editor trước đã.", "err"); return; }
    app.setTab("coach");
    send("Giải thích đoạn code sau trong ngữ cảnh bài này (không sửa hộ, không lộ lời giải):\n```cpp\n" + sel.slice(0, 1800) + "\n```");
  };

  // Focus the Coach composer (Ctrl+;).
  app.focusCoachInput = () => {
    app.setTab("coach");
    inputEl.focus();
  };

  // Fire a Coach quick-action from elsewhere in the app (e.g. the run/judge
  // result bar after a failed verdict). Reuses the exact same send() path so the
  // context, persistence and Stop button all behave identically.
  app.coachAsk = (kind) => {
    if (!app.state.currentId) { app.toast("Mở một bài trước đã.", "err"); return; }
    app.setTab("coach");
    if (kind === "nudge") send(NUDGE_PROMPT);
    else if (kind === "approach") send(APPROACH_PROMPT);
    else if (kind === "why-wa") send(WHY_WA_PROMPT);
    else if (kind === "why-tle") send(buildTlePrompt());
    else inputEl.focus();
  };

  // Called by main.js whenever a problem loads: reload that problem's saved chat.
  app.refreshChat = async () => {
    if (chatAbort) {
      chatAbort.abort();
      chatAbort = null;
    }
    sending = false;
    setSendMode("send");

    app.refreshCoachActions();
    if (!app.state.currentId) { renderHistory([]); return; }
    try {
      const { history } = await api.aiChatHistory(app.state.currentId);
      renderHistory(history);
    } catch { renderHistory([]); }
  };

  // ---- wiring ----

  sendBtn.addEventListener("click", () => {
    // Mid-flight the button is "⏹ Dừng": abort just this turn instead of sending.
    if (sending) { if (chatAbort) chatAbort.abort(); return; }
    send();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  if (clearBtn) clearBtn.addEventListener("click", async () => {
    if (!app.state.currentId) return;
    if (!confirm("Xóa toàn bộ hội thoại AI Coach của bài này?")) return;
    try {
      await api.aiChatClear(app.state.currentId);
      renderHistory([]);
      app.toast("Đã xóa hội thoại.", "ok");
    } catch (err) { app.toast(err.message, "err"); }
  });
}
