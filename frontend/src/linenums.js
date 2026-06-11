// linenums.js — tiny line-number gutter helpers shared by the Run console.

export function lineCount(text) {
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

export function setGutter(gutterEl, count) {
  if (Number(gutterEl.dataset.n) === count) return;
  gutterEl.dataset.n = String(count);
  let s = "";
  for (let i = 1; i <= count; i++) s += i + "\n";
  gutterEl.textContent = s;
}

// Wire an editable textarea (or read-only <pre>) to a gutter, kept in sync.
export function attachGutter(field, gutterEl, { editable = true } = {}) {
  const refresh = () => setGutter(gutterEl, lineCount(field.value != null ? field.value : field.textContent || ""));
  const sync = () => { gutterEl.scrollTop = field.scrollTop; };
  if (editable) field.addEventListener("input", refresh);
  field.addEventListener("scroll", sync);
  refresh();
  return refresh;
}
