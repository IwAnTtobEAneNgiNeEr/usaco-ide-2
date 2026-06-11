// features/desktop-launcher.js — tiny app-shell niceties when running inside the
// Electron desktop wrapper (vs a plain browser tab). No-op in a normal browser.

export function initDesktopShell() {
  const isElectron = /electron/i.test(navigator.userAgent) || !!(window.process && window.process.versions && window.process.versions.electron);
  document.body.classList.toggle("is-desktop", isElectron);
  if (isElectron) {
    // Desktop app feel: don't let the whole chrome be text-selectable / drag-image.
    document.documentElement.classList.add("desktop-chrome");
  }
  return isElectron;
}
