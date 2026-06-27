// core/bus.js — a tiny synchronous pub/sub. Pure and DOM-free so it can be
// unit-tested under node:test and shared by every frontend module.
export function createBus() {
  const map = new Map(); // event -> Set<fn>
  return {
    on(event, fn) {
      let set = map.get(event);
      if (!set) { set = new Set(); map.set(event, set); }
      set.add(fn);
      return () => { const s = map.get(event); if (s) s.delete(fn); };
    },
    off(event, fn) { const s = map.get(event); if (s) s.delete(fn); },
    emit(event, payload) {
      const set = map.get(event);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error(`[bus] ${event} handler failed:`, err); }
      }
    }
  };
}
