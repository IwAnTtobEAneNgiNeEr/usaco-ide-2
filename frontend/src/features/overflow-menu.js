// features/overflow-menu.js — a tiny, dependency-free dropdown for tucking
// secondary toolbar actions out of the way. Keeps the topbar/editor toolbars
// clean without removing any feature.
//
// Markup:
//   <div class="ov-menu">
//     <button class="ov-trigger">⋯</button>
//     <div class="ov-panel"> …command buttons… </div>
//   </div>
//
// The command buttons keep their original ids, so the feature modules that wired
// them up by id keep working — clicking one inside the panel fires its handler
// and then the panel closes.

export function initOverflowMenus() {
  const menus = [...document.querySelectorAll(".ov-menu")];
  if (!menus.length) return;

  const closeAll = (except) => menus.forEach((m) => { if (m !== except) m.classList.remove("open"); });

  menus.forEach((menu) => {
    const trigger = menu.querySelector(".ov-trigger");
    const panel = menu.querySelector(".ov-panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains("open");
      closeAll(menu);
      menu.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
    });

    // A click on an actual command closes the menu (its own handler still runs).
    panel.addEventListener("click", (e) => {
      if (e.target.closest("button")) { menu.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); }
    });
  });

  // Outside click / Escape closes every menu.
  document.addEventListener("click", () => closeAll(null));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(null); });
}
