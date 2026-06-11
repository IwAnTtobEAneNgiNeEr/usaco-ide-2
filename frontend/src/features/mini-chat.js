// mini-chat.js — AI Coach. A scoped, per-problem Q&A panel, available as soon as
// a problem is open (no timer gate — help should be one click away for CP use).
// Conversation is persisted per problem (chat.json) and context is windowed
// server-side, so token use stays small. The AI answers only within this problem
// and, by default, never hands over a full solution unless "Cho xem lời giải" is on.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

// Minimal, safe Markdown-ish rendering: escape first, then `inline code`, **bold**,
// and preserve line breaks. No raw HTML ever reaches the DOM.
function renderText(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

export function initMiniChat(app) {
  const chatEl = document.getElementById("coach-chat");
  const messagesEl = document.getElementById("coach-messages");
  const inputEl = document.getElementById("coach-input");
  const sendBtn = document.getElementById("coach-send");
  const clearBtn = document.getElementById("coach-clear");
  const revealEl = document.getElementById("coach-reveal");
  const hintBtn = document.getElementById("coach-hint");
  if (!chatEl || !messagesEl) return;

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
      return `<div class="coach-msg coach-msg-${who}"><div class="coach-bubble">${renderText(t.content)}</div></div>`;
    }).join("");
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
    appendBubble("user", renderText(msg));
    const thinking = appendBubble("assistant", `<span class="spinner"></span> đang nghĩ…`, "coach-thinking");

    // Stream the reply into the bubble as it arrives; renderText is regex-cheap,
    // so a requestAnimationFrame throttle keeps repaints at most once per frame.
    const bubble = thinking.querySelector(".coach-bubble");
    let acc = "";
    let rafPending = false;
    const paint = () => {
      rafPending = false;
      if (app.state.currentId !== pid) return;
      bubble.innerHTML = renderText(acc);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

    try {
      const res = await api.aiChatStream({
        problemId: pid,
        message: msg,
        revealAllowed: Boolean(revealEl && revealEl.checked),
        code: app.getEditorValue(),
        testResult: latestVerdict(),
        runHistory: recentRunHistory()
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
      bubble.innerHTML = renderText(acc);
      bubble.classList.remove("coach-thinking");
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (app.playSound) app.playSound("complete");
    } catch (err) {
      if (app.state.currentId !== pid) return;
      bubble.classList.remove("coach-thinking");
      if (err && err.aborted) {
        // Keep whatever already streamed — partial reasoning is still useful.
        const partial = err.partial || acc;
        bubble.innerHTML = partial
          ? renderText(partial) + ` <span class="coach-err">⏹ (đã dừng)</span>`
          : `<span class="coach-err">⏹ Đã dừng câu trả lời này.</span>`;
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
    "Cho mình một gợi ý NHẸ về hướng đi của bài này — tối đa 2 câu, không lộ thuật toán đầy đủ, không viết code.";
  const APPROACH_PROMPT =
    "Bài này nên đưa về dạng bài / kỹ thuật nào? Giải thích ngắn gọn vì sao kỹ thuật đó phù hợp với ràng buộc của đề — không viết code.";
  const WHY_WA_PROMPT =
    "Code mình đang WA. Dựa vào lịch sử chạy và kết quả test gần nhất, chỉ ra mình sai tư duy ở đâu hoặc thiếu trường hợp nào — không viết code sửa hộ.";

  // TLE prompt is built per click so it can carry the problem's constraints +
  // time limit (the AI then reasons complexity-vs-constraints, not vibes).
  function buildTlePrompt() {
    const meta = app.state.meta || {};
    const a = meta.analysis || {};
    let p = "Code mình đang TLE. Hãy ước lượng độ phức tạp hiện tại của code, chỉ ra đoạn nghẽn nhất, và độ phức tạp mục tiêu cần đạt để qua — không viết code sửa hộ.";
    if (a.rangBuoc) p += `\nRàng buộc đề: ${a.rangBuoc}`;
    if (Number(meta.timeLimitMs) > 0) p += `\nGiới hạn thời gian: ${meta.timeLimitMs}ms`;
    return p;
  }

  const actionsRow = document.createElement("div");
  actionsRow.className = "coach-actions";
  actionsRow.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" data-qa="nudge" title="Một cú hích nhỏ, không lộ thuật toán">💡 Gợi ý nhẹ</button>
    <button type="button" class="btn btn-ghost btn-sm" data-qa="approach" title="Dạng bài / kỹ thuật phù hợp">🧭 Hướng tiếp cận</button>
    <button type="button" class="btn btn-ghost btn-sm hidden" data-qa="why-wa" title="Phân tích vì sao đang Wrong Answer">❓ Vì sao WA?</button>
    <button type="button" class="btn btn-ghost btn-sm hidden" data-qa="why-tle" title="Độ phức tạp hiện tại vs ràng buộc">🐢 Vì sao TLE?</button>
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

  // Toggle the verdict-specific quick actions (WA/TLE) to match the latest run.
  app.refreshCoachActions = () => {
    const h = (app.state.meta && app.state.meta.history && app.state.meta.history[0]) || null;
    const v = h ? (h.verdict || h.type) : "";
    actionsRow.querySelector('[data-qa="why-wa"]').classList.toggle("hidden", v !== "WA");
    actionsRow.querySelector('[data-qa="why-tle"]').classList.toggle("hidden", v !== "TLE");
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
  if (hintBtn) hintBtn.addEventListener("click", () => { if (app.openHint) app.openHint(); });
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
