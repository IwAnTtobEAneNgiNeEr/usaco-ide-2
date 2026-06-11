// features/sidebar-toggle.js — collapse/expand the left Problem Explorer.
// State is persisted in localStorage so a reload keeps it. Ctrl/Cmd+B toggles.

const KEY = "usaco.sidebar.collapsed";

export function initSidebarToggle() {
  const workbench = document.querySelector(".workbench");
  const colHead = document.querySelector(".col-problems .col-head");
  if (!workbench || !colHead) return;

  const toggle = document.createElement("button");
  toggle.id = "sb-toggle";
  toggle.className = "sb-toggle";
  toggle.type = "button";
  toggle.title = "Thu gọn / mở rộng (Ctrl+B)";
  colHead.insertBefore(toggle, colHead.firstChild);

  let collapsed = false;
  try { collapsed = localStorage.getItem(KEY) === "1"; } catch { /* ignore */ }

  const apply = (v) => {
    workbench.classList.toggle("sb-collapsed", v);
    toggle.textContent = v ? "›" : "‹";
    toggle.setAttribute("aria-expanded", String(!v));
  };
  apply(collapsed);

  const set = (v) => {
    collapsed = v;
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
    apply(v);
  };

  toggle.addEventListener("click", () => set(!collapsed));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      set(!collapsed);
    }
  });
}
