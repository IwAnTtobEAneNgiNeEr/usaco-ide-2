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
  { re: /^(hint|gợi ý|gợi y|ý tưởng|y tuong)\b/i, cls: "hint", icon: "💡" },
  { re: /^(observation|nhận xét|quan sát)\b/i, cls: "obs", icon: "🔍" },
  { re: /^(mistake|lỗi sai|lỗi|sai lầm|sai sót thường gặp|sai sót)\b/i, cls: "mistake", icon: "❌" },
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
// streaming painter and the final/persisted render.
function setAiContent(bubbleEl, text) {
  bubbleEl.innerHTML = renderAi(text);
  try {
    highlightKeywords(bubbleEl);
    groupSectionsIntoCards(bubbleEl);
    renderMath(bubbleEl);
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
      messagesEl.innerHTML = header + `<div class="coach-empty">Bạn cần gợi ý gì? Hỏi về hướng tư duy, vì sao code sai, edge case còn thiếu…</div>`;
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

    // Stream the reply into the bubble as it arrives; renderText is regex-cheap,
    // so a requestAnimationFrame throttle keeps repaints at most once per frame.
    const bubble = thinking.querySelector(".coach-bubble");
    let acc = "";
    let rafPending = false;
    const paint = () => {
      rafPending = false;
      if (app.state.currentId !== pid) return;
      setAiContent(bubble, acc);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

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
        onDelta: (_d, full) => {
          acc = full;
          bubble.classList.remove("coach-thinking");
          if (!rafPending) { rafPending = true; requestAnimationFrame(paint); }
        }
      });
      // Switched problems mid-flight: don't render A's reply into B's thread.
      // The turn is already persisted to A's chat.json server-side.
      if (app.state.currentId !== pid) return;
      acc = res.reply || acc || "(không có phản hồi)";
      setAiContent(bubble, acc);
      bubble.classList.remove("coach-thinking");
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (app.playSound) app.playSound("complete");
    } catch (err) {
      if (app.state.currentId !== pid) return;
      bubble.classList.remove("coach-thinking");
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
    "Bài này quy về dạng/kỹ thuật nào? Trả lời gọn 3 ý: (1) tên kỹ thuật, (2) vì sao nó khớp với ĐÚNG ràng buộc của đề này (đừng nói chung chung), (3) minh họa nhanh bằng sample input của đề. Không viết code.";
  const WHY_WA_PROMPT =
    "Code mình đang WA. ĐỪNG viết lại bài — hãy debug đúng code mình đang có. Trả lời gọn 3 ý: (1) mình đang hiểu lầm điều gì (gọi tên lỗi tư duy trong 1 câu), (2) một input nhỏ cụ thể khiến code mình chạy sai, kèm nó in ra gì so với đáp án đúng, (3) dòng/biến nào gây ra. Không viết code sửa hộ.";

  // TLE prompt is built per click so it can carry the problem's constraints +
  // time limit (the AI then reasons complexity-vs-constraints, not vibes).
  function buildTlePrompt() {
    const meta = app.state.meta || {};
    const a = meta.analysis || {};
    let p = "Code mình đang TLE. Đừng viết lại bài. Trả lời gọn 3 ý: (1) ước lượng độ phức tạp code hiện tại và chỉ đúng vòng lặp/đoạn nghẽn, (2) ước số phép tính theo ràng buộc của đề để cho thấy vì sao nó quá chậm, (3) độ phức tạp mục tiêu cần đạt để qua. Không viết code sửa hộ.";
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
