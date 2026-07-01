const active = new WeakMap();
const COLORS = { cyan: "#45c8ff", amber: "#ffb74d", green: "#50e3a4", red: "#ff6b78", purple: "#b58cff", muted: "#64748b", ink: "#f4f7fb" };

export function disposeCanvasScene(canvas) {
  const state = active.get(canvas);
  if (!state) return;
  cancelAnimationFrame(state.raf || 0);
  window.removeEventListener("resize", state.resize);
  active.delete(canvas);
}

function roundRect(ctx, x, y, w, h, r = 6) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke();
}

export function renderCanvasScene(canvas, scene, opts = {}) {
  disposeCanvasScene(canvas);
  if (!canvas || !scene || !Array.isArray(scene.elements)) return false;
  const ctx = canvas.getContext("2d");
  const animate = opts.animate !== false;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, frame = 0;
  const state = { resize: null, raf: 0 };
  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); canvas._w = rect.width; canvas._h = rect.height;
    draw();
  };
  const point = (el) => ({ x: (el.x == null ? .5 : el.x) * canvas._w, y: (el.y == null ? .5 : el.y) * canvas._h });
  const byId = () => Object.fromEntries(scene.elements.filter((e) => e.id).map((e) => [e.id, point(e)]));
  function draw() {
    const w = canvas._w || 300, h = canvas._h || 200, ids = byId();
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#0d1523"; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1.5; ctx.textBaseline = "middle"; ctx.font = "600 12px system-ui, sans-serif";
    if (["clock", "timeline"].includes(scene.visualType)) {
      const sequence = scene.elements.find((el) => el.type === "sequence" && Array.isArray(el.values));
      const values = (sequence && sequence.values || []).slice(0, 5);
      const activeIndex = values.length ? (reduced ? Math.min(2, values.length - 1) : Math.floor(frame / 45) % values.length) : 0;
      const current = values[activeIndex] || "23:59:59";
      ctx.fillStyle="#08101b";ctx.strokeStyle=COLORS.cyan;ctx.lineWidth=1.5;roundRect(ctx,w/2-62,18,124,48,9);
      ctx.fillStyle=COLORS.amber;ctx.textAlign="center";ctx.font="700 22px ui-monospace, monospace";ctx.fillText(current,w/2,42);
      const y=105,x1=18,x2=w-18;ctx.strokeStyle="rgba(69,200,255,.6)";ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();
      values.forEach((value,i)=>{const x=values.length===1?w/2:x1+(x2-x1)*i/(values.length-1);ctx.fillStyle=i===activeIndex?COLORS.amber:COLORS.cyan;ctx.beginPath();ctx.arc(x,y,i===activeIndex?5:3,0,Math.PI*2);ctx.fill();ctx.fillStyle=i===activeIndex?COLORS.amber:COLORS.ink;ctx.font="700 9px ui-monospace, monospace";ctx.fillText(value,x,y+20);});
      ctx.fillStyle=COLORS.muted;ctx.font="600 9px system-ui, sans-serif";ctx.fillText("ROLLOVER THEO TỪNG GIÂY",w/2,h-16);
      frame++;
      if (animate && !reduced) { raf=requestAnimationFrame(draw);state.raf=raf; }
      return;
    }
    if (/(grid|maze|path)/i.test(scene.visualType)) {
      const grid = scene.elements.find((el) => el.type === "grid") || {};
      const pathEl = scene.elements.find((el) => el.type === "path" && Array.isArray(el.points) && el.points.length);
      const rows = Math.max(3, Math.min(8, grid.rows || 5)), cols = Math.max(3, Math.min(8, grid.cols || 5));
      const size = Math.min((w - 56) / cols, (h - 38) / rows, 30);
      const gw = cols * size, gh = rows * size, sx = (w - gw) / 2, sy = (h - gh) / 2 + 5;
      const route = pathEl
        ? pathEl.points
            .map((p) => ({ r: Math.max(0, Math.min(rows - 1, Number(p && p.r) || 0)), c: Math.max(0, Math.min(cols - 1, Number(p && p.c) || 0)) }))
            .filter((p, idx, arr) => idx === 0 || p.r !== arr[idx - 1].r || p.c !== arr[idx - 1].c)
        : [];
      if (!route.length) {
        for (let c = 0; c < cols; c++) route.push({ r: 0, c });
        for (let r = 1; r < rows; r++) route.push({ r, c: cols - 1 });
      }
      const progress = reduced ? route.length - 1 : Math.floor(frame / 20) % route.length;
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
        const routeIndex = route.findIndex((p)=>p.r===r&&p.c===c);
        const isWall = Boolean((grid.cells || [])[r * cols + c]);
        ctx.fillStyle = isWall ? "rgba(100,116,139,.32)" : (routeIndex >= 0 && routeIndex <= progress ? "rgba(80,227,164,.2)" : "rgba(69,200,255,.06)");
        ctx.strokeStyle = "rgba(100,180,220,.34)";ctx.fillRect(sx+c*size+1,sy+r*size+1,size-2,size-2);ctx.strokeRect(sx+c*size+1,sy+r*size+1,size-2,size-2);
      }
      if (progress > 0) { ctx.strokeStyle=COLORS.green;ctx.lineWidth=3;ctx.beginPath();route.slice(0,progress+1).forEach((p,i)=>{const x=sx+(p.c+.5)*size,y=sy+(p.r+.5)*size;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke(); }
      const robot=route[progress] || { r: 0, c: 0 };const rx=sx+(robot.c+.5)*size,ry=sy+(robot.r+.5)*size;
      ctx.fillStyle=COLORS.amber;ctx.beginPath();ctx.arc(rx,ry,Math.max(5,size*.22),0,Math.PI*2);ctx.fill();
      const start = route[0] || { r: 0, c: 0 }, goal = route[route.length - 1] || { r: rows - 1, c: cols - 1 };
      ctx.fillStyle=COLORS.ink;ctx.font="700 9px system-ui, sans-serif";ctx.textAlign="center";
      ctx.fillText("S",sx+(start.c+.5)*size,sy+(start.r+.5)*size-9);
      ctx.fillText("ĐÍCH",sx+(goal.c+.5)*size,sy+(goal.r+.5)*size+10);
      frame++;
      if (animate && !reduced) { raf=requestAnimationFrame(draw);state.raf=raf; }
      return;
    }
    for (const el of scene.elements) {
      const p = point(el), color = COLORS[el.color] || COLORS.cyan;
      ctx.strokeStyle = color; ctx.fillStyle = color;
      if (["edge", "arrow"].includes(el.type)) {
        const a = ids[el.from] || p, b = ids[el.to] || { x: (el.x2 || .8) * w, y: (el.y2 || .5) * h };
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (el.type === "arrow") { const ang = Math.atan2(b.y-a.y,b.x-a.x); ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-8*Math.cos(ang-.45),b.y-8*Math.sin(ang-.45)); ctx.lineTo(b.x-8*Math.cos(ang+.45),b.y-8*Math.sin(ang+.45)); ctx.closePath(); ctx.fill(); }
      } else if (el.type === "sequence" || el.type === "stack" || el.type === "queue") {
        const vals = el.values || [], cw = Math.min(70, (w * .92) / Math.max(1, vals.length)), sx = p.x - vals.length*cw/2;
        const longest = Math.max(1, ...vals.map((v) => String(v).length));
        const fontSize = Math.max(8, Math.min(15, (cw - 8) / (longest * .62)));
        vals.forEach((v,i) => { ctx.fillStyle = (el.highlight||[]).includes(i) ? "rgba(69,200,255,.22)" : "rgba(100,116,139,.12)"; ctx.strokeStyle = (el.highlight||[]).includes(i) ? COLORS.amber : color; roundRect(ctx,sx+i*cw,p.y-15,cw-4,30,5); ctx.fillStyle=COLORS.ink; ctx.textAlign="center"; ctx.font=`700 ${fontSize}px ui-monospace, monospace`; ctx.fillText(String(v),sx+i*cw+(cw-4)/2,p.y); });
        if (el.label) { ctx.fillStyle=COLORS.muted; ctx.textAlign="right"; ctx.fillText(el.label,sx-8,p.y); }
      } else if (el.type === "grid") {
        const rows=el.rows||4, cols=el.cols||4, size=Math.min(22,(w*.55)/cols,(h*.65)/rows), sx=p.x-cols*size/2, sy=p.y-rows*size/2;
        for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ctx.fillStyle=(el.cells||[])[r*cols+c]?"rgba(69,200,255,.28)":"rgba(100,116,139,.08)";ctx.strokeStyle="rgba(100,180,220,.35)";ctx.fillRect(sx+c*size,sy+r*size,size-2,size-2);ctx.strokeRect(sx+c*size,sy+r*size,size-2,size-2);}
      } else if (el.type === "clock") {
        ctx.fillStyle="#08101b";ctx.strokeStyle=color;roundRect(ctx,p.x-68,p.y-30,136,60,10);ctx.fillStyle=COLORS.amber;ctx.font="700 25px ui-monospace, monospace";ctx.textAlign="center";ctx.fillText((el.values&&el.values[0])||"23:59:59",p.x,p.y);
      } else if (el.type === "node") {
        ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fill();if(el.label){ctx.fillStyle=COLORS.ink;ctx.textAlign="center";ctx.fillText(el.label,p.x,p.y+20);}
      } else if (el.type === "timeline") {
        const x1 = el.x == null ? w*.12 : el.x*w, x2 = el.x2 == null ? x1 + (el.width || .76)*w : el.x2*w;
        ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x1,p.y);ctx.lineTo(Math.min(w-8,x2),p.y);ctx.stroke();
        for(let i=0;i<5;i++){const x=x1+(Math.min(w-8,x2)-x1)*i/4;ctx.beginPath();ctx.moveTo(x,p.y-4);ctx.lineTo(x,p.y+4);ctx.stroke();}
      } else if (el.type === "range") {
        ctx.fillStyle="rgba(69,200,255,.1)";ctx.strokeStyle=color;ctx.fillRect(p.x,p.y,(el.width||.35)*w,(el.height||.08)*h);ctx.strokeRect(p.x,p.y,(el.width||.35)*w,(el.height||.08)*h);
      } else if (el.type === "pointer") {
        ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo((el.x2==null?el.x:el.x2)*w,(el.y2==null?Math.min(1,(el.y||0)+.1):el.y2)*h);ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();
      } else if (["label", "region", "path", "tree"].includes(el.type)) {
        ctx.fillStyle=color;ctx.textAlign="center";ctx.fillText(el.text||el.label||"",p.x,p.y);
      }
    }
    frame++;
    if (animate && !scene.static && scene.steps > 1 && !reduced) { raf = requestAnimationFrame(draw); state.raf = raf; }
  }
  state.resize = resize;
  window.addEventListener("resize", resize); active.set(canvas, state); resize();
  return true;
}
