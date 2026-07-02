export function supportsNeonCanvas(topic, meta) {
  const analysis = meta?.analysis || {};
  const text = [meta?.title, topic, ...(analysis.tags || []), ...(analysis.kyThuat || [])].join(" ").toLowerCase();
  return /(kmp|knapsack|dijkstra|monotonic stack|convex hull|kruskal|prim|sliding window|binary search|flood fill|\bbfs\b|\bdfs\b|\blis\b|segment tree|fenwick|trie|n-queens|hanoi|prefix sum|bitmask|topological|\blca\b|sieve|prime|max flow|hoán vị|permutation|queue|stack|greedy|merge sort|quick sort|string|array|mê cung|đồng hồ|clock|timeline|robot|pathfinding|grid|đường đi|lưới)/i.test(text);
}

export function initNeonCanvas(canvas, topic, meta, opts = {}) {
  const ctx = canvas.getContext('2d');
  const shouldAnimate = opts.animate !== false;
  let animationFrame;
  let frame = 0;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._logicalWidth = rect.width;
    canvas._logicalHeight = rect.height;
  }
  
  resize();
  window.addEventListener('resize', resize);

  // --- Utilities ---
  function drawGlow(x, y, r, color, blur) {
    ctx.save();
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRoundedRectGlow(x, y, w, h, r, color, blur, fillOpacity = '0.1', strokeStyle = null) {
    ctx.save();
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.strokeStyle = strokeStyle || color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.stroke();
    let fillColor = color;
    if (color.startsWith('rgba')) {
      fillColor = color.replace(/[\d\.]+\)$/, fillOpacity + ')');
    }
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();
  }

  function drawLineGlow(x1, y1, x2, y2, color, blur, width = 2) {
    ctx.save();
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  // Common dimensions
  const getW = () => canvas._logicalWidth || 320;
  const getH = () => canvas._logicalHeight || 250;

  // --- 1. KMP (String Matching) ---
  function renderKMP() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const text = "A B A B C A B A B A";
    const patt = "A B A B A";
    const textArr = text.split(" ");
    const pattArr = patt.split(" ");
    const lps = [0, 0, 1, 2, 3]; // LPS array
    
    const cellW = 25, cellH = 30;
    const startX = (w - textArr.length * cellW) / 2;
    
    // Animate pattern sliding and LPS jumps
    const cycleLen = 90;
    const steps = [
      { t: 0, p: 0, m: 4 }, // match up to 4
      { t: 0, p: 4, m: 4, fail: true }, // mismatch at index 4 (C != A)
      { t: 2, p: 2, m: 2 }, // jump to lps[3] = 2, shift pattern
      { t: 2, p: 2, m: 3, fail: true }, // mismatch (C != A)
      { t: 4, p: 0, m: 0 }, // jump to lps[1] = 0
      { t: 4, p: 0, m: 1, fail: true }, // mismatch (C != A)
      { t: 5, p: 0, m: 5 }, // match fully
    ];
    
    const totalCycles = steps.length;
    const stepIdx = Math.floor((frame % (totalCycles * cycleLen)) / cycleLen);
    const progress = (frame % cycleLen) / cycleLen;
    const state = steps[stepIdx];
    
    // Draw Text
    textArr.forEach((c, i) => {
      const x = startX + i * cellW;
      const y = h/2 - 40;
      let color = "rgba(100, 200, 255, 0.3)";
      if (i >= state.t && i < state.t + state.m) color = "rgba(50, 255, 150, 0.8)"; // matched
      if (state.fail && i === state.t + state.m) color = "rgba(255, 100, 100, 0.8)"; // failed char
      drawRoundedRectGlow(x, y, cellW-4, cellH, 4, color, color.includes("0.8") ? 10 : 0, '0.1');
      ctx.fillStyle = "#fff";
      ctx.font = "14px monospace";
      ctx.fillText(c, x + cellW/2 - 4, y + 20);
    });

    // Draw Pattern (smooth slide)
    let curTx = state.t;
    if (stepIdx > 0 && progress < 0.3) { // smooth transition
        const prev = steps[stepIdx - 1];
        curTx = prev.t + (state.t - prev.t) * (progress / 0.3);
    }
    
    pattArr.forEach((c, i) => {
      const x = startX + (curTx + i) * cellW;
      const y = h/2 + 10;
      let color = "rgba(255, 150, 50, 0.4)";
      if (i < state.m) color = "rgba(50, 255, 150, 0.8)";
      if (state.fail && i === state.m) color = "rgba(255, 100, 100, 0.8)";
      drawRoundedRectGlow(x, y, cellW-4, cellH, 4, color, color.includes("0.8") ? 10 : 0, '0.2');
      ctx.fillStyle = "#fff";
      ctx.fillText(c, x + cellW/2 - 4, y + 20);
    });
    
    // LPS Array display
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px sans-serif";
    ctx.fillText("LPS: [0, 0, 1, 2, 3]", startX, h/2 + 70);
  }

  // --- 2. Dijkstra (Wavefront Expansion) ---
  function renderDijkstra() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const nodes = [
      {x: w*0.15, y: h*0.5, id: 1}, {x: w*0.35, y: h*0.2, id: 2}, {x: w*0.4, y: h*0.8, id: 3},
      {x: w*0.65, y: h*0.3, id: 4}, {x: w*0.7, y: h*0.7, id: 5}, {x: w*0.85, y: h*0.5, id: 6}
    ];
    const edges = [
      {u: 0, v: 1, w: 4, dist: 1}, {u: 0, v: 2, w: 2, dist: 1}, {u: 1, v: 3, w: 1, dist: 2},
      {u: 2, v: 3, w: 5, dist: 2}, {u: 2, v: 4, w: 3, dist: 2}, {u: 3, v: 5, w: 6, dist: 3}, {u: 4, v: 5, w: 2, dist: 3}
    ];
    const cycleLen = 400, cycle = frame % cycleLen, progress = cycle / cycleLen;

    ctx.save();
    edges.forEach(edge => {
      const nu = nodes[edge.u], nv = nodes[edge.v];
      const edgeStart = (edge.dist - 1) * 0.25, edgeEnd = edge.dist * 0.25;
      let active = progress > edgeStart && progress < edgeEnd;
      let settled = progress >= edgeEnd;
      const isShortest = (edge.u===0&&edge.v===2) || (edge.u===2&&edge.v===4) || (edge.u===4&&edge.v===5);
      
      ctx.beginPath(); ctx.moveTo(nu.x, nu.y); ctx.lineTo(nv.x, nv.y);
      ctx.strokeStyle = (settled && isShortest) ? "rgba(50, 255, 150, 0.6)" : "rgba(100, 200, 255, 0.15)";
      ctx.lineWidth = (settled && isShortest) ? 3 : 2;
      ctx.stroke();

      if (active) {
        const pr = (progress - edgeStart) / (edgeEnd - edgeStart);
        drawGlow(nu.x + (nv.x-nu.x)*pr, nu.y + (nv.y-nu.y)*pr, 4, "rgba(255, 150, 50, 1)", 15);
      }
    });
    ctx.restore();

    // Concentric Wavefront from Source
    const maxRadius = w;
    const waveR = progress * maxRadius * 1.5;
    ctx.beginPath();
    ctx.arc(nodes[0].x, nodes[0].y, waveR, 0, Math.PI*2);
    ctx.strokeStyle = "rgba(100, 200, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    nodes.forEach((n, idx) => {
      const distToSource = Math.hypot(n.x - nodes[0].x, n.y - nodes[0].y);
      let color = "rgba(100, 200, 255, 0.3)";
      let r = 6;
      if (waveR > distToSource) {
         color = "rgba(50, 255, 150, 0.8)"; // Explored
         if (Math.abs(waveR - distToSource) < 20) r = 10; // pop effect
      }
      if (idx === 0) color = "rgba(255, 100, 100, 1)";
      drawGlow(n.x, n.y, r, color, r > 6 ? 20 : 10);
    });
  }

  // --- 3. Knapsack 0/1 (DP Matrix Decision) ---
  function renderKnapsack() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const rows = 4, cols = 6;
    const cellW = 30, cellH = 30;
    const startX = w/2 - (cols*cellW)/2 + 20;
    const startY = h/2 - (rows*cellH)/2;
    
    const cycleLen = 60, totalCells = rows * cols;
    const cellIdx = Math.floor((frame % (totalCells * cycleLen)) / cycleLen);
    const cr = Math.floor(cellIdx / cols);
    const cc = cellIdx % cols;
    
    // Draw DP Table
    for(let r=0; r<rows; r++) {
      for(let c=0; c<cols; c++) {
        let color = "rgba(100, 200, 255, 0.2)", fill = "0.05", blur = 0;
        if (r === cr && c === cc) {
           color = "rgba(255, 150, 50, 1)"; fill = "0.4"; blur = 15;
        } else if (r < cr || (r === cr && c < cc)) {
           color = "rgba(50, 255, 150, 0.5)"; fill = "0.1";
        }
        drawRoundedRectGlow(startX + c*cellW, startY + r*cellH, cellW-2, cellH-2, 3, color, blur, fill);
      }
    }
    
    // Draw decision arrows (max of taking vs not taking)
    if (cr > 0) {
       const weight = (cr % 3) + 1; // fake weight
       const x = startX + cc*cellW + cellW/2;
       const y = startY + cr*cellH;
       // Arrow up (not taking)
       drawLineGlow(x, y, x, y - cellH/2, "rgba(255, 255, 255, 0.6)", 5, 1);
       // Arrow diagonal (taking)
       if (cc >= weight) {
          drawLineGlow(x, y, startX + (cc-weight)*cellW + cellW/2, y - cellH/2, "rgba(255, 100, 100, 0.8)", 8, 2);
       }
    }
    
    // Draw Items
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "12px sans-serif";
    ctx.fillText("Items", startX - 50, startY - 10);
    for(let i=0; i<rows; i++) {
       const active = i === cr;
       drawRoundedRectGlow(startX - 50, startY + i*cellH, 20, cellH-4, 2, active ? "rgba(255, 150, 50, 1)" : "rgba(100, 200, 255, 0.4)", active?10:0, active?'0.5':'0.1');
    }
  }

  // --- 4. Monotonic Stack (Largest Rectangle) ---
  function renderMonotonicStack() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const heights = [2, 1, 5, 6, 2, 3];
    const maxH = 6;
    const cellW = 30;
    const startX = w/2 - (heights.length*cellW)/2;
    const base = h/2 + 50;
    
    const cycleLen = 80;
    const totalSteps = heights.length + 3;
    const step = Math.floor((frame % (totalSteps*cycleLen))/cycleLen);
    
    // Current stack simulation up to `step`
    let stack = [];
    let rects = []; // popped rectangles
    for(let i=0; i<=step && i<heights.length; i++) {
       while(stack.length > 0 && heights[stack[stack.length-1]] >= heights[i]) {
          const popped = stack.pop();
          const leftIdx = stack.length === 0 ? -1 : stack[stack.length-1];
          rects.push({ start: leftIdx+1, end: i-1, h: heights[popped] });
       }
       stack.push(i);
    }
    
    // Draw bars
    heights.forEach((ht, i) => {
       const x = startX + i*cellW;
       const barH = (ht/maxH) * 80;
       let color = "rgba(100, 200, 255, 0.3)";
       if (i === step) color = "rgba(255, 150, 50, 0.8)"; // incoming
       else if (stack.includes(i)) color = "rgba(50, 255, 150, 0.6)"; // in stack
       else if (i < step) color = "rgba(100, 100, 100, 0.3)"; // popped
       drawRoundedRectGlow(x, base - barH, cellW-2, barH, 2, color, color.includes("0.")?0:10, '0.2');
    });
    
    // Draw largest spanned rectangle from recent pop
    if (rects.length > 0) {
       const lastRect = rects[rects.length-1];
       const rx = startX + lastRect.start * cellW;
       const rw = (lastRect.end - lastRect.start + 1) * cellW - 2;
       const rh = (lastRect.h/maxH) * 80;
       ctx.fillStyle = "rgba(255, 100, 200, 0.3)";
       ctx.fillRect(rx, base - rh, rw, rh);
       ctx.strokeStyle = "rgba(255, 100, 200, 0.8)";
       ctx.strokeRect(rx, base - rh, rw, rh);
    }
  }

  // --- 5. Graham Scan (Convex Hull) ---
  function renderGrahamScan() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const pts = [
      {x: w*0.2, y: h*0.8}, {x: w*0.8, y: h*0.7}, {x: w*0.5, y: h*0.2}, 
      {x: w*0.4, y: h*0.6}, {x: w*0.6, y: h*0.5}, {x: w*0.3, y: h*0.4}, {x: w*0.7, y: h*0.3}
    ]; // Pre-sorted by polar angle from bottom-left
    
    const hullSteps = [
      [0], [0,1], [0,1,4], [0,1,6], [0,1,6,2], 
      [0,1,6,2,5], [0,1,6,2,5,3], // 3 makes a right turn
      [0,1,6,2,5], // backtrack 3
      [0,1,6,2,5,0] // close
    ];
    
    const step = Math.floor((frame/60)) % hullSteps.length;
    const curHull = hullSteps[step];
    
    // Rubber band
    if (curHull.length > 1) {
       ctx.beginPath();
       ctx.moveTo(pts[curHull[0]].x, pts[curHull[0]].y);
       for(let i=1; i<curHull.length; i++) ctx.lineTo(pts[curHull[i]].x, pts[curHull[i]].y);
       ctx.strokeStyle = "rgba(50, 255, 150, 0.8)";
       ctx.lineWidth = 2;
       ctx.shadowBlur = 10;
       ctx.shadowColor = "rgba(50, 255, 150, 1)";
       ctx.stroke();
       ctx.shadowBlur = 0;
    }
    
    pts.forEach((p, i) => {
       const inHull = curHull.includes(i);
       drawGlow(p.x, p.y, 4, inHull ? "rgba(255, 150, 50, 1)" : "rgba(100, 200, 255, 0.5)", inHull?15:0);
    });
  }

  // --- 6. Kruskal (DSU) ---
  function renderKruskal() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const nodes = [
      {x: w*0.2, y: h*0.4, c: 0}, {x: w*0.4, y: h*0.2, c: 1}, {x: w*0.4, y: h*0.7, c: 2},
      {x: w*0.6, y: h*0.5, c: 3}, {x: w*0.8, y: h*0.3, c: 4}, {x: w*0.8, y: h*0.7, c: 5}
    ];
    const edges = [
      {u:0, v:1, ok:true}, {u:1, v:3, ok:true}, {u:0, v:2, ok:true},
      {u:2, v:3, ok:false}, // cycle
      {u:3, v:4, ok:true}, {u:4, v:5, ok:true}, {u:3, v:5, ok:false} // cycle
    ];
    
    const step = Math.floor(frame/60) % (edges.length + 2);
    
    // Simulate DSU colors
    const colors = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#e0aaff"];
    let parent = [0,1,2,3,4,5];
    
    edges.forEach((e, i) => {
       if (i < step) {
          if (e.ok) {
             const rootU = parent[e.u];
             const rootV = parent[e.v];
             for(let k=0; k<6; k++) if(parent[k]===rootV) parent[k] = rootU; // union
          }
       }
    });
    
    ctx.lineWidth = 3;
    edges.forEach((e, i) => {
       if (i > step) return; // not evaluated yet
       ctx.beginPath();
       ctx.moveTo(nodes[e.u].x, nodes[e.u].y);
       ctx.lineTo(nodes[e.v].x, nodes[e.v].y);
       
       if (i === step) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; // Evaluating
          ctx.shadowBlur = 10; ctx.shadowColor = "#fff";
       } else if (e.ok) {
          ctx.strokeStyle = colors[parent[e.u]]; // Merged color
          ctx.shadowBlur = 15; ctx.shadowColor = ctx.strokeStyle;
       } else {
          ctx.strokeStyle = "rgba(255, 50, 50, 0.3)"; // Rejected (Cycle)
          ctx.shadowBlur = 0;
       }
       ctx.stroke();
       ctx.shadowBlur = 0;
    });
    
    nodes.forEach((n, i) => {
       drawGlow(n.x, n.y, 8, colors[parent[i]], 15);
    });
  }

  // --- 7. Sliding Window (Caterpillar) ---
  function renderSlidingWindow() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const arr = [2, 5, 2, 7, 8, 5, 9]; // Find longest sub without repeats
    const cellW = 35;
    const startX = w/2 - (arr.length*cellW)/2;
    const startY = h/2 - 20;
    
    const steps = [
      {l:0, r:0}, {l:0, r:1}, {l:0, r:2, dup:true}, // dup 2
      {l:1, r:2}, {l:1, r:3}, {l:1, r:4}, {l:1, r:5, dup:true}, // dup 5
      {l:2, r:5}, {l:2, r:6}
    ];
    
    const step = Math.floor(frame/60) % steps.length;
    const state = steps[step];
    
    for(let i=0; i<arr.length; i++) {
       const inWin = i >= state.l && i <= state.r;
       let color = "rgba(100, 200, 255, 0.2)";
       if (inWin) color = "rgba(150, 80, 255, 0.6)";
       if (state.dup && i === state.r) color = "rgba(255, 100, 100, 0.8)"; // Duplicate collision
       
       drawRoundedRectGlow(startX + i*cellW, startY, cellW-4, 40, 4, color, inWin?15:0, inWin?'0.3':'0.1');
       ctx.fillStyle = "#fff";
       ctx.font = "16px monospace";
       ctx.fillText(arr[i], startX + i*cellW + cellW/2 - 5, startY + 25);
    }
    
    // Connect L and R like a caterpillar
    const lx = startX + state.l*cellW + cellW/2;
    const rx = startX + state.r*cellW + cellW/2;
    ctx.beginPath();
    ctx.moveTo(lx, startY - 10);
    ctx.quadraticCurveTo((lx+rx)/2, startY - 30, rx, startY - 10);
    ctx.strokeStyle = state.dup ? "rgba(255, 100, 100, 1)" : "rgba(50, 255, 150, 1)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // --- 8. Binary Search on Answer ---
  function renderBinarySearchAnswer() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const maxVal = 100;
    const barW = w * 0.8;
    const startX = w * 0.1;
    const startY = h / 2;
    
    const steps = [
      {l: 0, r: 100, m: 50, valid: true}, // ans <= 50
      {l: 0, r: 50, m: 25, valid: false}, // ans > 25
      {l: 25, r: 50, m: 37, valid: true},
      {l: 25, r: 37, m: 31, valid: true},
      {l: 25, r: 31, m: 28, valid: false}
    ];
    const step = Math.floor(frame/90) % steps.length;
    const state = steps[step];
    
    // Draw a clean rail with endpoints so it reads as a deliberate diagram,
    // not a stray line.
    const railY = startY + 8;
    const railH = 16;
    const rx = startX + (state.l / maxVal) * barW;
    const rw = ((state.r - state.l) / maxVal) * barW;
    const mx = startX + (state.m / maxVal) * barW;

    ctx.fillStyle = "rgba(7, 13, 23, 0.95)";
    ctx.strokeStyle = "rgba(100, 200, 255, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(startX, railY - 8, barW, railH + 16, 12);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rx, railY, rw, railH, 10);
    ctx.clip();
    const grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    grad.addColorStop(0, "rgba(50, 255, 150, 0.14)");
    grad.addColorStop(0.5, "rgba(69, 200, 255, 0.26)");
    grad.addColorStop(1, "rgba(50, 255, 150, 0.14)");
    ctx.fillStyle = grad;
    ctx.fillRect(rx, railY, rw, railH);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(rx, railY, rw, railH, 10);
    ctx.strokeStyle = "rgba(50, 255, 150, 0.72)";
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(50, 255, 150, 0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Mid pointer as a clear marker above the rail.
    drawLineGlow(mx, railY - 26, mx, railY + railH + 18, state.valid ? "rgba(50, 255, 150, 1)" : "rgba(255, 100, 100, 1)", 15, 3);
    drawGlow(mx, railY - 24, 5, state.valid ? "rgba(50, 255, 150, 1)" : "rgba(255, 100, 100, 1)", 12);
    
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(`Mid: ${state.m} => ${state.valid ? "Valid (shrink right)" : "Invalid (shrink left)"}`, startX, railY - 30);

    // Endpoint labels so the visual has structure even when the bar is short.
    const labelY = railY + 38;
    const label = (x, text, color) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - 18, labelY - 14, 36, 22, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 10px var(--mono)";
      ctx.textAlign = "center";
      ctx.fillText(text, x, labelY + 1);
      ctx.restore();
    };
    label(startX + (state.l / maxVal) * barW, `L=${state.l}`, "rgba(59, 130, 246, 0.22)");
    label(startX + (state.r / maxVal) * barW, `R=${state.r}`, "rgba(239, 68, 68, 0.20)");
  }

  // --- 9. Flood Fill (BFS Maze) ---
  function renderFloodFill() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const grid = 8;
    const cellS = 25;
    const startX = w/2 - (grid*cellS)/2;
    const startY = h/2 - (grid*cellS)/2;
    
    // Distance from center (3,3)
    const maxDist = 8;
    const progress = (Math.floor(frame/15) % 15) - 2; 
    
    for(let r=0; r<grid; r++) {
      for(let c=0; c<grid; c++) {
        const dist = Math.abs(r-3) + Math.abs(c-3); // Manhattan BFS
        let isWall = (r===2&&c>1&&c<6) || (r===5&&c<5); // Simple maze walls
        
        let color = "rgba(100, 200, 255, 0.1)";
        let fill = '0.05';
        
        if (isWall) {
           color = "rgba(100, 100, 100, 0.8)"; fill = '0.8';
        } else if (dist <= progress) {
           color = "rgba(50, 150, 255, 0.8)"; fill = '0.5';
           if (dist === progress) color = "rgba(150, 255, 255, 1)"; // Wavefront
        }
        
        ctx.fillStyle = color;
        ctx.fillRect(startX + c*cellS + 1, startY + r*cellS + 1, cellS-2, cellS-2);
      }
    }
  }

  // --- 10. LIS (Patience Sorting) ---
  function renderLIS() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const stream = [10, 22, 9, 33, 21, 50, 41, 60];
    const piles = [[10, 9], [22, 21], [33], [50, 41], [60]]; // Final state representation
    
    const cardW = 30, cardH = 40;
    const startX = w/2 - (piles.length*40)/2;
    
    const step = Math.floor(frame/60) % 9; // up to 8 numbers
    
    let curPiles = [];
    for(let i=0; i<step && i<stream.length; i++) {
        let val = stream[i];
        let placed = false;
        for(let p of curPiles) {
            if(p[p.length-1] >= val) { p.push(val); placed = true; break; }
        }
        if(!placed) curPiles.push([val]);
    }
    
    curPiles.forEach((pile, pi) => {
       pile.forEach((val, vi) => {
          const x = startX + pi*40;
          const y = h/2 - 20 + vi*10;
          const isTop = vi === pile.length-1;
          drawRoundedRectGlow(x, y, cardW, cardH, 4, isTop ? "rgba(50, 255, 150, 0.8)" : "rgba(100, 200, 255, 0.3)", isTop?10:0, '0.8');
          if (isTop) {
              ctx.fillStyle = "#111"; ctx.font = "14px bold sans-serif";
              ctx.fillText(val, x + 5, y + 25);
          }
       });
    });
    
    ctx.fillStyle = "#fff";
    ctx.fillText(`LIS Length: ${curPiles.length}`, startX, h/2 + 80);
  }

  // --- 11. Merge Sort ---
  function renderMergeSort() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    // Simulate recursive split and merge visually via Y-axis depth
    const levels = [
      [ {x:0, w:8, vals:[8,3,5,1,9,2,7,4]} ],
      [ {x:0, w:4, vals:[8,3,5,1]}, {x:4, w:4, vals:[9,2,7,4]} ],
      [ {x:0, w:2, vals:[3,8]}, {x:2, w:2, vals:[1,5]}, {x:4, w:2, vals:[2,9]}, {x:6, w:2, vals:[4,7]} ],
      [ {x:0, w:8, vals:[1,2,3,4,5,7,8,9]} ] // Merged final
    ];
    
    const step = Math.floor(frame/90) % levels.length;
    const lvl = levels[step];
    
    const cellW = 20;
    const startX = w/2 - (8*cellW)/2;
    
    lvl.forEach((block) => {
       block.vals.forEach((v, i) => {
          const bx = startX + (block.x + i) * cellW;
          const by = h/2 - 20 + (step === 3 ? 0 : step * 30 - 30);
          drawRoundedRectGlow(bx, by, cellW-2, 25, 2, "rgba(100, 200, 255, 0.8)", 10, '0.3');
          ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif";
          ctx.fillText(v, bx + 5, by + 16);
       });
    });
  }

  // --- 12. Segment Tree ---
  function renderSegmentTree() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const nodes = [
      {id:1, x:w/2, y:h*0.2, val:36},
      {id:2, x:w/3, y:h*0.5, val:16}, {id:3, x:w*0.66, y:h*0.5, val:20},
      {id:4, x:w*0.2, y:h*0.8, val:6}, {id:5, x:w*0.4, y:h*0.8, val:10},
      {id:6, x:w*0.6, y:h*0.8, val:8}, {id:7, x:w*0.8, y:h*0.8, val:12}
    ];
    
    const updatePath = [4, 2, 1]; // Leaf to root update
    const phase = Math.floor(frame/60) % 4;
    
    ctx.lineWidth = 2;
    [[1,2],[1,3],[2,4],[2,5],[3,6],[3,7]].forEach(([u,v]) => {
        ctx.strokeStyle = "rgba(100, 200, 255, 0.3)";
        if (phase > 0 && updatePath.includes(u) && updatePath.includes(v) && phase >= updatePath.indexOf(v)) {
            ctx.strokeStyle = "rgba(255, 150, 50, 1)"; // glowing update path
        }
        ctx.beginPath(); ctx.moveTo(nodes[u-1].x, nodes[u-1].y); ctx.lineTo(nodes[v-1].x, nodes[v-1].y); ctx.stroke();
    });
    
    nodes.forEach(n => {
       let color = "rgba(100, 200, 255, 0.8)";
       if (phase > 0 && updatePath.includes(n.id) && phase >= updatePath.indexOf(n.id)) color = "rgba(50, 255, 150, 1)";
       drawGlow(n.x, n.y, 12, color, 15);
       ctx.fillStyle = "#000"; ctx.font = "10px sans-serif";
       ctx.fillText(n.val + (color.includes("150") ? "+x" : ""), n.x - 8, n.y + 3);
    });
  }

  // --- 13. Trie (Prefix Tree) ---
  function renderTrie() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    // Tree for "cat", "car", "dog"
    const nodes = [
      {i:0, char:'*', x:w/2, y:h*0.2},
      {i:1, char:'c', x:w/3, y:h*0.4}, {i:2, char:'d', x:w*0.66, y:h*0.4},
      {i:3, char:'a', x:w/3, y:h*0.6}, {i:4, char:'o', x:w*0.66, y:h*0.6},
      {i:5, char:'t', x:w*0.2, y:h*0.8}, {i:6, char:'r', x:w*0.46, y:h*0.8}, {i:7, char:'g', x:w*0.66, y:h*0.8}
    ];
    
    const wordSearch = [0, 1, 3, 6]; // searching "car"
    const phase = Math.floor(frame/40) % 5;
    
    ctx.lineWidth = 2;
    [[0,1],[0,2],[1,3],[2,4],[3,5],[3,6],[4,7]].forEach(([u,v]) => {
        ctx.strokeStyle = "rgba(100, 200, 255, 0.3)";
        ctx.beginPath(); ctx.moveTo(nodes[u].x, nodes[u].y); ctx.lineTo(nodes[v].x, nodes[v].y); ctx.stroke();
    });
    
    nodes.forEach(n => {
       let color = "rgba(100, 200, 255, 0.6)";
       if (phase > 0 && wordSearch.includes(n.i) && phase >= wordSearch.indexOf(n.i)) color = "rgba(255, 150, 50, 1)";
       drawGlow(n.x, n.y, 10, color, 15);
       ctx.fillStyle = "#fff"; ctx.fillText(n.char, n.x-4, n.y+4);
    });
  }

  // --- 14. N-Queens ---
  function renderNQueens() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const N = 4, cellS = 30;
    const startX = w/2 - (N*cellS)/2, startY = h/2 - (N*cellS)/2;
    
    // Chessboard
    for(let r=0; r<N; r++) {
      for(let c=0; c<N; c++) {
         ctx.fillStyle = (r+c)%2===0 ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.2)";
         ctx.fillRect(startX + c*cellS, startY + r*cellS, cellS, cellS);
      }
    }
    
    const solution = [1, 3, 0, 2]; // Valid 4-queens
    const step = Math.floor(frame/60) % 5;
    
    for(let i=0; i<step; i++) {
       const r = i, c = solution[i];
       const x = startX + c*cellS + cellS/2, y = startY + r*cellS + cellS/2;
       drawGlow(x, y, 10, "rgba(255, 100, 100, 1)", 20);
       // Laser lines
       drawLineGlow(startX, y, startX + N*cellS, y, "rgba(255,100,100,0.3)", 5, 1);
       drawLineGlow(x, startY, x, startY + N*cellS, "rgba(255,100,100,0.3)", 5, 1);
    }
  }

  // --- 15. Tower of Hanoi ---
  function renderHanoi() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const pegs = [w*0.2, w*0.5, w*0.8];
    const base = h*0.8;
    
    // Draw pegs
    pegs.forEach(px => {
       drawLineGlow(px, base, px, base - 80, "rgba(100, 200, 255, 0.5)", 10, 4);
    });
    
    // Simulate one move
    const isMoving = (frame % 120) < 60;
    const diskW = 60, diskH = 15;
    
    // Static disks
    drawRoundedRectGlow(pegs[0] - diskW/2, base - diskH, diskW, diskH, 5, "rgba(255, 150, 50, 0.8)", 10, '0.6');
    drawRoundedRectGlow(pegs[0] - diskW*0.8/2, base - diskH*2, diskW*0.8, diskH, 5, "rgba(50, 255, 150, 0.8)", 10, '0.6');
    
    // Moving disk
    let mx = isMoving ? pegs[0] + (pegs[2]-pegs[0]) * ((frame%60)/60) : pegs[2];
    let my = isMoving ? base - 100 + Math.sin((frame%60)/60 * Math.PI)*-20 : base - diskH;
    drawRoundedRectGlow(mx - diskW*0.6/2, my, diskW*0.6, diskH, 5, "rgba(100, 200, 255, 0.8)", 15, '0.8');
  }

  // --- 16. Prefix Sum (2D) ---
  function renderPrefixSum() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     const rows = 4, cols = 4, cellS = 35;
     const startX = w/2 - (cols*cellS)/2, startY = h/2 - (rows*cellS)/2;
     
     const step = Math.floor(frame/60) % 5;
     const targetR = 2, targetC = 2; // Querying (0,0) to (2,2)
     
     for(let r=0; r<rows; r++) {
       for(let c=0; c<cols; c++) {
          let inQuery = r <= targetR && c <= targetC;
          let color = inQuery && step > 1 ? "rgba(50, 255, 150, 0.6)" : "rgba(100, 200, 255, 0.2)";
          drawRoundedRectGlow(startX + c*cellS, startY + r*cellS, cellS-2, cellS-2, 2, color, 0, '0.1');
       }
     }
     
     // Outline the queried area
     if (step > 2) {
         ctx.strokeStyle = "rgba(255, 150, 50, 1)"; ctx.lineWidth = 3;
         ctx.strokeRect(startX, startY, (targetC+1)*cellS - 2, (targetR+1)*cellS - 2);
     }
  }

  // --- 17. Bitmask DP ---
  function renderBitmask() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     const bits = [1, 0, 1, 1, 0];
     const step = Math.floor(frame/30) % 5;
     
     bits.forEach((b, i) => {
         let active = i === step;
         let val = active ? 1 - b : b; // flip
         let color = val === 1 ? "rgba(50, 255, 150, 1)" : "rgba(100, 100, 100, 0.5)";
         drawGlow(w/2 - 60 + i*30, h/2, 12, color, val===1 ? 20 : 0);
         ctx.fillStyle = "#fff"; ctx.fillText(val, w/2 - 64 + i*30, h/2 + 4);
     });
  }

  // --- 18. Topological Sort ---
  function renderTopologicalSort() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     const nodes = [1, 2, 3, 4, 5];
     const step = Math.floor(frame/40) % 6;
     
     nodes.forEach((n, i) => {
         let color = i < step ? "rgba(50, 255, 150, 1)" : "rgba(100, 200, 255, 0.3)";
         let x = w*0.1 + i*50;
         drawGlow(x, h/2, 10, color, i<step?15:0);
         if (i < 4) drawLineGlow(x+15, h/2, x+35, h/2, color, 5, 2);
     });
  }

  // --- 19. LCA (Two Pointers on Tree) ---
  function renderLCA() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     const p1 = {x: w*0.3, y: h*0.8}, p2 = {x: w*0.7, y: h*0.8}; // leaves
     const m1 = {x: w*0.4, y: h*0.5}, m2 = {x: w*0.6, y: h*0.5}; // mid
     const root = {x: w*0.5, y: h*0.2}; // LCA
     
     drawLineGlow(p1.x, p1.y, m1.x, m1.y, "rgba(100,200,255,0.2)", 0);
     drawLineGlow(p2.x, p2.y, m2.x, m2.y, "rgba(100,200,255,0.2)", 0);
     drawLineGlow(m1.x, m1.y, root.x, root.y, "rgba(100,200,255,0.2)", 0);
     drawLineGlow(m2.x, m2.y, root.x, root.y, "rgba(100,200,255,0.2)", 0);
     
     const step = Math.floor(frame/45) % 4;
     let c1 = step>0 ? m1 : p1;
     let c2 = step>1 ? m2 : p2;
     if (step===3) { c1 = root; c2 = root; }
     
     drawGlow(c1.x, c1.y, 8, "rgba(255,100,100,1)", 15);
     drawGlow(c2.x, c2.y, 8, "rgba(50,255,150,1)", 15);
  }

  // --- 20. Fenwick Tree (BIT) ---
  function renderFenwickTree() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     const y = h/2;
     [1,2,3,4,5,6,7,8].forEach((i) => {
         const x = w*0.1 + i*25;
         drawGlow(x, y, 6, "rgba(100, 200, 255, 0.5)", 0);
     });
     // Show jumps: 7 -> 6 -> 4
     const jumpProgress = (frame%120)/120;
     ctx.strokeStyle = "rgba(255, 150, 50, 1)"; ctx.lineWidth = 2;
     ctx.beginPath();
     if(jumpProgress > 0) { ctx.moveTo(w*0.1+7*25, y); ctx.quadraticCurveTo(w*0.1+6.5*25, y-30, w*0.1+6*25, y); }
     if(jumpProgress > 0.5) { ctx.moveTo(w*0.1+6*25, y); ctx.quadraticCurveTo(w*0.1+5*25, y-40, w*0.1+4*25, y); }
     ctx.stroke();
  }

  // --- 21. Fast Exponentiation ---
  function renderFastExponentiation() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     ctx.fillStyle = "rgba(100, 200, 255, 0.8)"; ctx.font = "16px monospace"; ctx.textAlign="center";
     ctx.fillText("x^10", w/2, h*0.2);
     
     const step = Math.floor(frame/40) % 4;
     if(step > 0) {
         drawLineGlow(w/2, h*0.25, w*0.3, h*0.5, "rgba(50,255,150,0.5)", 5);
         drawLineGlow(w/2, h*0.25, w*0.7, h*0.5, "rgba(50,255,150,0.5)", 5);
         ctx.fillText("(x^5)", w*0.3, h*0.6); ctx.fillText("(x^5)", w*0.7, h*0.6);
     }
     if(step > 1) {
         drawLineGlow(w*0.3, h*0.65, w*0.2, h*0.8, "rgba(255,150,50,0.5)", 5);
         ctx.fillText("x * (x^2)^2", w*0.2, h*0.9);
     }
  }

  // --- 22. Prime Sieve ---
  function renderPrimeSieve() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     const cellS = 20, cols = 10, startX = w/2 - (cols*cellS)/2, startY = h/2 - 40;
     const step = Math.floor(frame/30) % 12; // multiple of 2
     
     for(let i=2; i<=21; i++) {
         const r = Math.floor((i-2)/cols), c = (i-2)%cols;
         const x = startX + c*cellS, y = startY + r*cellS;
         let isPrime = [2,3,5,7,11,13,17,19].includes(i);
         let crossed = !isPrime && i <= step*2;
         drawRoundedRectGlow(x, y, cellS-2, cellS-2, 2, isPrime?"rgba(50,255,150,0.8)":"rgba(100,200,255,0.2)", crossed?0:10, '0.2');
         if(crossed) drawLineGlow(x, y, x+cellS-2, y+cellS-2, "rgba(255,50,50,0.8)", 5);
         ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif"; ctx.fillText(i, x+4, y+12);
     }
  }

  // --- 23. Max Flow ---
  function renderMaxFlow() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     drawLineGlow(w*0.2, h*0.5, w*0.8, h*0.5, "rgba(100,200,255,0.2)", 0, 10);
     const flowW = ((frame%100)/100) * (w*0.6);
     drawLineGlow(w*0.2, h*0.5, w*0.2 + flowW, h*0.5, "rgba(50,255,150,1)", 15, 6);
     drawGlow(w*0.2, h*0.5, 12, "rgba(255,100,100,1)", 20); // Source
     drawGlow(w*0.8, h*0.5, 12, "rgba(100,100,255,1)", 20); // Sink
  }

  // --- 24. Backtracking ---
  function renderBacktracking() {
     const w = getW(), h = getH();
     ctx.clearRect(0, 0, w, h);
     
     const nodes = [
       { id: 0, x: w/2, y: h*0.2, label: "Start" },
       { id: 1, x: w*0.3, y: h*0.5, label: "A" },
       { id: 2, x: w*0.7, y: h*0.5, label: "B" },
       { id: 3, x: w*0.15, y: h*0.8, label: "A1 (X)" },
       { id: 4, x: w*0.45, y: h*0.8, label: "A2 (V)" },
     ];
     const edges = [
       { u: 0, v: 1 }, { u: 0, v: 2 }, { u: 1, v: 3 }, { u: 1, v: 4 }
     ];
     
     edges.forEach(e => {
        drawLineGlow(nodes[e.u].x, nodes[e.u].y, nodes[e.v].x, nodes[e.v].y, "rgba(255,255,255,0.1)", 0);
     });
     
     const cycleLen = 120;
     const step = Math.floor(frame / (cycleLen / 4)) % 6;
     
     let activeNode = 0;
     let drawEdges = [];
     if (step >= 1) { activeNode = 1; drawEdges.push({u:0, v:1, color:"rgba(50,200,255,1)"}); }
     if (step === 2) { activeNode = 3; drawEdges.push({u:1, v:3, color:"rgba(255,100,100,1)"}); }
     if (step === 3) { activeNode = 1; drawEdges.push({u:3, v:1, color:"rgba(255,100,100,1)"}); } // Backtrack
     if (step >= 4) { activeNode = 4; drawEdges.push({u:1, v:4, color:"rgba(50,255,150,1)"}); } // Success
     
     drawEdges.forEach(e => {
        drawLineGlow(nodes[e.u].x, nodes[e.u].y, nodes[e.v].x, nodes[e.v].y, e.color, 10);
     });
     
     nodes.forEach(n => {
        let fill = "rgba(20,20,30,1)";
        let stroke = "rgba(100,200,255,0.4)";
        if (n.id === activeNode) {
           stroke = (n.id === 3 && step === 2) ? "rgba(255,50,50,1)" : (n.id === 4 ? "rgba(50,255,150,1)" : "rgba(50,200,255,1)");
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, 12, 0, Math.PI*2);
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
        
        ctx.fillStyle = "#fff"; ctx.font = "11px monospace"; ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + 25);
     });
  }

  // --- 25. Queue ---
  function renderQueue() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const boxW = 40, boxH = 40;
    const maxQ = 5;
    const startX = w/2 - (maxQ*boxW)/2;
    const startY = h/2 - boxH/2;
    
    drawLineGlow(startX - 20, startY, startX + maxQ*boxW + 20, startY, "rgba(100, 200, 255, 0.5)", 5, 2);
    drawLineGlow(startX - 20, startY + boxH, startX + maxQ*boxW + 20, startY + boxH, "rgba(100, 200, 255, 0.5)", 5, 2);
    
    const cycleLen = 120;
    const phase = frame % cycleLen;
    const isEnqueue = phase < 60;
    const progress = (phase % 60) / 60;
    
    if (isEnqueue) {
      [2, 7, 1].forEach((val, i) => {
         const x = startX + i*boxW;
         drawRoundedRectGlow(x+2, startY+2, boxW-4, boxH-4, 4, "rgba(100, 200, 255, 0.6)", 10, '0.3');
         ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="14px sans-serif"; ctx.fillText(val, x+boxW/2, startY+25);
      });
      const ix = startX + 4*boxW - (progress * boxW); 
      ctx.globalAlpha = progress;
      drawRoundedRectGlow(ix+2, startY+2, boxW-4, boxH-4, 4, "rgba(50, 255, 150, 0.8)", 15, '0.5');
      ctx.fillStyle = "#fff"; ctx.fillText("5", ix+boxW/2, startY+25);
      ctx.globalAlpha = 1.0;
    } else {
      let q = [2, 7, 1, 5];
      const outX = startX - (progress * boxW);
      ctx.globalAlpha = 1 - progress;
      drawRoundedRectGlow(outX+2, startY+2, boxW-4, boxH-4, 4, "rgba(255, 100, 100, 0.8)", 15, '0.5');
      ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.fillText("2", outX+boxW/2, startY+25);
      ctx.globalAlpha = 1.0;
      
      for(let i=1; i<4; i++) {
        const sx = startX + i*boxW - (progress * boxW);
        drawRoundedRectGlow(sx+2, startY+2, boxW-4, boxH-4, 4, "rgba(100, 200, 255, 0.6)", 10, '0.3');
        ctx.fillStyle = "#fff"; ctx.fillText(q[i], sx+boxW/2, startY+25);
      }
    }
  }

  // --- 26. Stack ---
  function renderStack() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const boxW = 50, boxH = 30;
    const maxS = 4;
    const startX = w/2 - boxW/2;
    const startY = h/2 + (maxS*boxH)/2;
    
    ctx.beginPath();
    ctx.moveTo(startX, startY - maxS*boxH);
    ctx.lineTo(startX, startY);
    ctx.lineTo(startX + boxW, startY);
    ctx.lineTo(startX + boxW, startY - maxS*boxH);
    ctx.strokeStyle = "rgba(100, 200, 255, 0.5)"; ctx.lineWidth = 3;
    ctx.stroke();
    
    const cycleLen = 120;
    const phase = frame % cycleLen;
    const isPush = phase < 60;
    const progress = (phase % 60) / 60;
    
    let stack = [8, 3, 5];
    
    if (isPush) {
       stack.forEach((val, i) => {
          const y = startY - (i+1)*boxH;
          drawRoundedRectGlow(startX+2, y+2, boxW-4, boxH-4, 4, "rgba(100, 200, 255, 0.6)", 10, '0.3');
          ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="14px sans-serif"; ctx.fillText(val, startX+boxW/2, y+20);
       });
       const iy = startY - 5*boxH + (progress * 2*boxH);
       ctx.globalAlpha = progress;
       drawRoundedRectGlow(startX+2, iy+2, boxW-4, boxH-4, 4, "rgba(50, 255, 150, 0.8)", 15, '0.5');
       ctx.fillStyle = "#fff"; ctx.fillText("9", startX+boxW/2, iy+20);
       ctx.globalAlpha = 1.0;
    } else {
       stack.forEach((val, i) => {
          const y = startY - (i+1)*boxH;
          drawRoundedRectGlow(startX+2, y+2, boxW-4, boxH-4, 4, "rgba(100, 200, 255, 0.6)", 10, '0.3');
          ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.fillText(val, startX+boxW/2, y+20);
       });
       const oy = startY - 4*boxH - (progress * 2*boxH);
       ctx.globalAlpha = 1 - progress;
       drawRoundedRectGlow(startX+2, oy+2, boxW-4, boxH-4, 4, "rgba(255, 100, 100, 0.8)", 15, '0.5');
       ctx.fillStyle = "#fff"; ctx.fillText("9", startX+boxW/2, oy+20);
       ctx.globalAlpha = 1.0;
    }
  }

  // --- 27. Greedy Coin Change ---
  function renderGreedy() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const target = 87;
    const coins = [50, 20, 10, 5, 1];
    const cycleLen = 150;
    const totalSteps = 6;
    const step = Math.floor((frame % (totalSteps*cycleLen)) / cycleLen);
    
    let chosen = [];
    let curRem = target;
    for(let i=0; i<step; i++) {
       for(let c of coins) {
          if (c <= curRem) {
             chosen.push(c);
             curRem -= c;
             break;
          }
       }
    }
    
    ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign="center";
    ctx.fillText("Target: " + target + " | Remaining: " + curRem, w/2, h*0.2);
    
    const coinW = 40;
    const startX = w/2 - (coins.length*coinW)/2;
    coins.forEach((c, i) => {
       const cx = startX + i*coinW;
       drawGlow(cx + 15, h*0.4, 18, "rgba(100, 200, 255, 0.5)", 0);
       ctx.fillStyle = "#000"; ctx.font = "12px sans-serif"; ctx.fillText(c, cx + 15, h*0.4 + 4);
    });
    
    const chX = w/2 - (chosen.length*coinW)/2;
    chosen.forEach((c, i) => {
       const cx = chX + i*coinW;
       drawGlow(cx + 15, h*0.7, 18, "rgba(50, 255, 150, 0.8)", 15);
       ctx.fillStyle = "#000"; ctx.font = "12px sans-serif"; ctx.fillText(c, cx + 15, h*0.7 + 4);
    });
  }

  // --- 28. Basic String ---
  function renderBasicString() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const str = "USACO IDE";
    const cellW = 30, cellH = 40;
    const startX = w/2 - (str.length*cellW)/2;
    const startY = h/2 - cellH/2;
    
    const cycleLen = 30;
    const step = Math.floor(frame / cycleLen) % (str.length + 5);
    
    for(let i=0; i<str.length; i++) {
       const x = startX + i*cellW;
       let color = "rgba(100, 200, 255, 0.2)";
       let active = false;
       if (i === step) { color = "rgba(50, 255, 150, 0.8)"; active = true; }
       else if (i < step) color = "rgba(100, 200, 255, 0.6)";
       
       drawRoundedRectGlow(x, startY, cellW-4, cellH, 4, color, active?15:0, '0.2');
       ctx.fillStyle = "#fff"; ctx.font="16px monospace"; ctx.textAlign="center";
       ctx.fillText(str[i], x + cellW/2 - 2, startY + 25);
    }
  }

  // --- 29. Basic Array ---
  function renderBasicArray() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const arr = [15, 8, 23, 4, 42, 16];
    const cellW = 35, cellH = 35;
    const startX = w/2 - (arr.length*cellW)/2;
    const startY = h/2 - cellH/2;
    
    const cycleLen = 40;
    const step = Math.floor(frame / cycleLen) % (arr.length + 3);
    
    for(let i=0; i<arr.length; i++) {
       const x = startX + i*cellW;
       let color = "rgba(100, 200, 255, 0.2)";
       let active = false;
       if (i === step) { color = "rgba(255, 150, 50, 0.8)"; active = true; }
       else if (i < step) color = "rgba(100, 200, 255, 0.6)";
       
       drawRoundedRectGlow(x, startY, cellW-4, cellH, 4, color, active?15:0, '0.2');
       ctx.fillStyle = "#fff"; ctx.font="14px monospace"; ctx.textAlign="center";
       ctx.fillText(arr[i], x + cellW/2 - 2, startY + 22);
    }
  }

  // Fallbacks & Existing simple ones
  function renderMathFallback() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(frame*0.02);
    ctx.strokeStyle = "rgba(100, 200, 255, 0.4)"; ctx.lineWidth=2; ctx.beginPath();
    for(let i=0; i<6; i++) { ctx.lineTo(Math.cos(i*Math.PI/3)*40, Math.sin(i*Math.PI/3)*40); }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(50, 255, 150, 0.8)"; ctx.font = "italic 20px serif"; ctx.fillText("ƒ(x)", w/2-15, h/2+5);
  }

  function renderSorting() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const heights = [20, 60, 40, 80, 30, 90, 50, 70];
    const n = heights.length, barW = 20, startX = w/2 - (n*25)/2, startY = h*0.8;
    const globalCycle = Math.floor((frame % 1680) / 60);
    let arr = [...heights], activeA = -1, activeB = -1, swapped = false, step = 0;
    for(let i=0; i<n-1; i++) {
        for(let j=0; j<n-i-1; j++) {
            if (step === globalCycle) { activeA = j; activeB = j+1; swapped = arr[j]>arr[j+1]; }
            if (arr[j]>arr[j+1]) { let tmp=arr[j]; arr[j]=arr[j+1]; arr[j+1]=tmp; }
            if (step === globalCycle) break;
            step++;
        }
        if (step === globalCycle) break;
    }
    for(let i=0; i<n; i++) {
      let color = "rgba(100, 200, 255, 0.6)";
      if (i===activeA || i===activeB) color = swapped ? "rgba(255, 100, 100, 1)" : "rgba(50, 255, 150, 1)";
      drawRoundedRectGlow(startX + i*25, startY - arr[i], barW, arr[i], 2, color, i===activeA||i===activeB?15:0, '0.3');
    }
  }

  // Exact permutation visual. Image models are poor at ordered digits, while
  // the generic backtracking tree does not explain generation order.
  function renderPermutation() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const rows = [
      { values: [3, 2, 1], label: "Bắt đầu" },
      { values: [3, 1, 2], label: "Hoán vị kế" },
      { values: [2, 3, 1], label: "Tiếp tục" }
    ];
    const cell = Math.min(34, Math.max(26, w / 11));
    const rowWidth = cell * 3;
    const startX = (w - rowWidth) / 2;
    const startY = Math.max(18, (h - rows.length * 48) / 2);

    rows.forEach((row, r) => {
      const y = startY + r * 48;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillStyle = r === 0 ? "rgba(255, 183, 77, .9)" : "rgba(158, 174, 198, .72)";
      ctx.fillText(row.label, startX - 14, y + cell / 2);
      row.values.forEach((value, i) => {
        const active = r === 0 || (r === 1 && i > 0);
        const color = active ? "rgba(65, 200, 255, .85)" : "rgba(100, 140, 190, .38)";
        drawRoundedRectGlow(startX + i * cell, y, cell - 5, cell - 5, 5, color, active ? 7 : 0, active ? "0.18" : "0.08");
        ctx.fillStyle = "#f5f7fb";
        ctx.textAlign = "center";
        ctx.font = "700 15px ui-monospace, monospace";
        ctx.fillText(String(value), startX + i * cell + (cell - 5) / 2, y + (cell - 5) / 2);
      });
      if (r < rows.length - 1) {
        const ax = startX + rowWidth / 2 - 3;
        drawLineGlow(ax, y + cell - 1, ax, y + 44, "rgba(255, 183, 77, .55)", 4, 1.5);
        ctx.fillStyle = "rgba(255, 183, 77, .8)";
        ctx.beginPath();
        ctx.moveTo(ax - 4, y + 40);
        ctx.lineTo(ax + 4, y + 40);
        ctx.lineTo(ax, y + 45);
        ctx.fill();
      }
    });
    ctx.textAlign = "center";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(158, 174, 198, .7)";
    ctx.fillText("SINH THEO THỨ TỰ NGƯỢC", w / 2, h - 10);
  }


  // --- 30. Sparse Table (RMQ) ---
  function renderSparseTable() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const arr = [4, 6, 1, 5, 2, 7, 3, 8];
    const cellW = 28;
    const startX = w/2 - (arr.length*cellW)/2;
    const startY = h/2 - 50;

    const cycleLen = 120;
    const step = Math.floor(frame / cycleLen) % 4;
    
    arr.forEach((v, i) => {
      const x = startX + i*cellW;
      drawRoundedRectGlow(x, startY, cellW-3, 24, 3, "rgba(100, 200, 255, 0.4)", 0, '0.1');
      ctx.fillStyle = "#fff"; ctx.font = "12px monospace"; ctx.textAlign="center";
      ctx.fillText(v, x+cellW/2, startY + 16);
    });

    if (step >= 1) {
      const qStart = startX + 2*cellW;
      const qEnd = startX + 7*cellW - 3;
      drawLineGlow(qStart, startY - 10, qEnd, startY - 10, "rgba(255, 150, 50, 0.8)", 5, 2);
      ctx.fillStyle = "rgba(255, 150, 50, 1)"; ctx.font = "10px sans-serif";
      ctx.fillText("Query Min[2...6]", (qStart+qEnd)/2, startY - 16);
    }
    if (step >= 2) {
      const x1 = startX + 2*cellW;
      const w1 = cellW * 4 - 3;
      drawRoundedRectGlow(x1, startY + 35, w1, 20, 4, "rgba(50, 255, 150, 0.6)", 10, '0.2');
      ctx.fillStyle = "#86efac"; ctx.font = "10px monospace"; ctx.textAlign="center";
      ctx.fillText("ST[2][2] = 1", x1 + w1/2, startY + 48);
    }
    if (step >= 3) {
      const x2 = startX + 3*cellW;
      const w2 = cellW * 4 - 3;
      drawRoundedRectGlow(x2, startY + 60, w2, 20, 4, "rgba(150, 80, 255, 0.6)", 10, '0.2');
      ctx.fillStyle = "#d8b4fe"; ctx.font = "10px monospace"; ctx.textAlign="center";
      ctx.fillText("ST[3][2] = 2", x2 + w2/2, startY + 73);
    }
  }

  // --- 31. Floyd-Warshall (Matrix updates) ---
  function renderFloydWarshall() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const N = 4;
    const cellS = 22;
    const startX = w/2 - (N*cellS)/2;
    const startY = h/2 - (N*cellS)/2;
    
    const k = Math.floor(frame / 60) % N;
    
    for(let r=0; r<N; r++) {
      for(let c=0; c<N; c++) {
        const x = startX + c*cellS;
        const y = startY + r*cellS;
        let isPivot = (r === k || c === k);
        let color = "rgba(100, 200, 255, 0.2)";
        let fill = '0.05';
        let blur = 0;
        
        if (r === k && c === k) {
          color = "rgba(255, 100, 100, 1)"; fill = '0.4'; blur = 12;
        } else if (isPivot) {
          color = "rgba(255, 150, 50, 0.7)"; fill = '0.2';
        } else if (r !== c) {
          color = "rgba(50, 255, 150, 0.5)"; fill = '0.1';
        }
        
        drawRoundedRectGlow(x, y, cellS-2, cellS-2, 2, color, blur, fill);
      }
    }
    
    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign="center";
    ctx.fillText(`K = ${k} (Pivoting via Node ${k+1})`, w/2, startY - 15);
    ctx.fillText("d[i][j] = min(d[i][j], d[i][k] + d[k][j])", w/2, startY + N*cellS + 20);
  }

  // --- 32. Bipartite Matching (Kuhn's Augmenting Path) ---
  function renderBipartiteMatching() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const left = [
      {x: w*0.3, y: h*0.25}, {x: w*0.3, y: h*0.45}, {x: w*0.3, y: h*0.65}, {x: w*0.3, y: h*0.85}
    ];
    const right = [
      {x: w*0.7, y: h*0.25}, {x: w*0.7, y: h*0.45}, {x: w*0.7, y: h*0.65}, {x: w*0.7, y: h*0.85}
    ];
    
    const edges = [
      {u: 0, v: 0, matched: true}, {u: 1, v: 1, matched: true},
      {u: 2, v: 1, matched: false}, {u: 2, v: 2, matched: false},
      {u: 3, v: 2, matched: false}, {u: 3, v: 3, matched: false}
    ];
    
    const cycleLen = 120;
    const phase = Math.floor(frame / cycleLen) % 3;
    
    edges.forEach(e => {
      let color = "rgba(255, 255, 255, 0.08)";
      let width = 1;
      
      if (e.matched) {
        color = "rgba(50, 255, 150, 0.7)";
        width = 2;
      }
      
      if (phase === 1) {
        if ((e.u === 2 && e.v === 1) || (e.u === 1 && e.v === 1) || (e.u === 1 && e.v === 2)) {
          color = "rgba(255, 150, 50, 0.8)";
          width = 3;
        }
      }
      
      drawLineGlow(left[e.u].x, left[e.u].y, right[e.v].x, right[e.v].y, color, width > 1 ? 8 : 0, width);
    });
    
    left.forEach((n, i) => {
      drawGlow(n.x, n.y, 8, "rgba(100, 200, 255, 0.8)", 10);
      ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif"; ctx.textAlign="center";
      ctx.fillText(`L${i+1}`, n.x - 20, n.y + 4);
    });
    right.forEach((n, i) => {
      drawGlow(n.x, n.y, 8, "rgba(150, 80, 255, 0.8)", 10);
      ctx.fillStyle = "#fff"; ctx.textAlign="center";
      ctx.fillText(`R${i+1}`, n.x + 20, n.y + 4);
    });
  }

  // --- 33. Priority Queue / Binary Heap (Bubble Up) ---
  function renderBinaryHeap() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const nodes = [
      {id: 0, x: w/2, y: h*0.2, val: 12},
      {id: 1, x: w/3, y: h*0.45, val: 15}, {id: 2, x: w*0.66, y: h*0.45, val: 20},
      {id: 3, x: w*0.2, y: h*0.75, val: 28}, {id: 4, x: w*0.42, y: h*0.75, val: 8}
    ];
    
    const cycle = Math.floor(frame / 60) % 4;
    
    let vals = [12, 15, 20, 28, 8];
    let highlight = -1;
    if (cycle === 1) {
      vals = [12, 8, 20, 28, 15];
      highlight = 1;
    } else if (cycle >= 2) {
      vals = [8, 12, 20, 28, 15];
      highlight = 0;
    } else {
      highlight = 4;
    }
    
    ctx.lineWidth = 2;
    [[0,1],[0,2],[1,3],[1,4]].forEach(([u,v]) => {
      ctx.strokeStyle = "rgba(100, 200, 255, 0.25)";
      ctx.beginPath(); ctx.moveTo(nodes[u].x, nodes[u].y); ctx.lineTo(nodes[v].x, nodes[v].y); ctx.stroke();
    });
    
    nodes.forEach((n, idx) => {
      let color = "rgba(100, 200, 255, 0.7)";
      if (idx === highlight) color = "rgba(50, 255, 150, 1)";
      drawGlow(n.x, n.y, 12, color, idx === highlight ? 18 : 8);
      ctx.fillStyle = "#111"; ctx.font = "bold 10px sans-serif"; ctx.textAlign="center";
      ctx.fillText(vals[idx], n.x, n.y + 3);
    });
    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign="center";
    ctx.fillText("Heap Insertion: Push 8 & Bubble Up", w/2, h*0.95);
  }

  // --- 34. Sweep Line (Closest Pair / Event Processing) ---
  function renderSweepLine() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const pts = [
      {x: w*0.15, y: h*0.4}, {x: w*0.3, y: h*0.75}, {x: w*0.42, y: h*0.3},
      {x: w*0.55, y: h*0.6}, {x: w*0.7, y: h*0.25}, {x: w*0.85, y: h*0.5}
    ];
    
    const progress = (frame % 300) / 300;
    const lineX = w * 0.1 + progress * (w * 0.8);
    
    drawLineGlow(lineX, h*0.15, lineX, h*0.85, "rgba(255, 150, 50, 0.9)", 15, 2);
    
    pts.forEach(p => {
      const inActiveSet = p.x < lineX && (lineX - p.x) < w*0.15;
      let color = "rgba(100, 200, 255, 0.3)";
      if (inActiveSet) color = "rgba(50, 255, 150, 0.8)";
      if (p.x >= lineX) color = "rgba(100, 200, 255, 0.1)";
      
      drawGlow(p.x, p.y, 5, color, inActiveSet ? 12 : 0);
    });
    
    ctx.fillStyle = "rgba(255, 150, 50, 0.1)";
    ctx.fillRect(lineX - w*0.15, h*0.15, w*0.15, h*0.7);
    ctx.strokeStyle = "rgba(255, 150, 50, 0.3)";
    ctx.strokeRect(lineX - w*0.15, h*0.15, w*0.15, h*0.7);
  }

  // --- 35. Heavy-Light Decomposition (HLD Tree Paths) ---
  function renderHLD() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const nodes = [
      {id: 1, x: w/2, y: h*0.18, isHeavy: true},
      {id: 2, x: w/3, y: h*0.42, isHeavy: true}, {id: 3, x: w*0.66, y: h*0.42, isHeavy: false},
      {id: 4, x: w*0.2, y: h*0.7, isHeavy: true}, {id: 5, x: w*0.42, y: h*0.7, isHeavy: false},
      {id: 6, x: w*0.6, y: h*0.7, isHeavy: true}, {id: 7, x: w*0.8, y: h*0.7, isHeavy: false}
    ];
    
    const edges = [
      {u: 0, v: 1, heavy: true},
      {u: 0, v: 2, heavy: false},
      {u: 1, v: 3, heavy: true},
      {u: 1, v: 4, heavy: false},
      {u: 2, v: 5, heavy: true},
      {u: 2, v: 6, heavy: false}
    ];
    
    edges.forEach(e => {
      ctx.strokeStyle = e.heavy ? "rgba(255, 50, 150, 0.85)" : "rgba(100, 200, 255, 0.25)";
      ctx.lineWidth = e.heavy ? 4 : 1.5;
      ctx.beginPath();
      ctx.moveTo(nodes[e.u].x, nodes[e.u].y);
      ctx.lineTo(nodes[e.v].x, nodes[e.v].y);
      ctx.stroke();
      if (e.heavy) {
        ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = "rgba(255, 50, 150, 1)";
        ctx.stroke(); ctx.restore();
      }
    });
    
    nodes.forEach(n => {
      let color = n.isHeavy ? "rgba(255, 50, 150, 1)" : "rgba(100, 200, 255, 0.8)";
      drawGlow(n.x, n.y, 8, color, n.isHeavy ? 15 : 6);
    });
    
    ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif"; ctx.textAlign="center";
    ctx.fillText("Heavy Paths in Pink (Glowing) | Light Edges in Blue", w/2, h*0.95);
  }

  // --- 36. Hash Table (Open Addressing Collision) ---
  function renderHashTable() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const slots = 6;
    const cellW = 32, cellH = 30;
    const startX = w/2 - cellW/2 - 40;
    const startY = h/2 - (slots*cellH)/2;
    
    const table = ["A", "B", "", "C", "", "D"];
    const cycle = Math.floor(frame / 60) % 4;
    
    for(let i=0; i<slots; i++) {
      let color = "rgba(100, 200, 255, 0.2)";
      let fill = '0.05';
      let val = table[i];
      
      if (i === 1 && cycle === 1) {
        color = "rgba(255, 100, 100, 0.8)"; fill = '0.3';
      } else if (i === 2 && cycle === 2) {
        color = "rgba(255, 150, 50, 0.8)"; fill = '0.3';
      } else if (i === 2 && cycle === 3) {
        color = "rgba(50, 255, 150, 0.8)"; fill = '0.3';
        val = "X";
      }
      
      drawRoundedRectGlow(startX, startY + i*cellH, cellW, cellH-3, 3, color, color.includes("0.8") ? 10 : 0, fill);
      
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "10px sans-serif"; ctx.textAlign="right";
      ctx.fillText(`[${i}]`, startX - 8, startY + i*cellH + 18);
      
      if (val) {
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px monospace"; ctx.textAlign="center";
        ctx.fillText(val, startX + cellW/2, startY + i*cellH + 18);
      }
    }
    
    if (cycle < 3) {
      const ix = startX + 70;
      const iy = startY + 1*cellH;
      drawRoundedRectGlow(ix, iy, cellW, cellH-3, 3, "rgba(255, 150, 50, 1)", 12, '0.4');
      ctx.fillStyle = "#fff"; ctx.font = "bold 12px monospace"; ctx.textAlign="center";
      ctx.fillText("X", ix + cellW/2, iy + 18);
      
      let targetY = iy + 15;
      if (cycle === 2) targetY += cellH;
      drawLineGlow(ix - 5, iy + 15, startX + cellW + 5, targetY, "rgba(255, 150, 50, 0.8)", 8, 2);
    }
  }

  // --- Main Render Loop & Router ---
  function loop() {

  // --- NEW ANIMATIONS ---

  function renderMazeDFS() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const rows = 9, cols = 15;
    // Calculate cellS dynamically to fit perfectly in current canvas dimensions
    const cellS = Math.floor(Math.min((w - 24) / cols, (h - 24) / rows));
    const startX = w/2 - (cols*cellS)/2;
    const startY = h/2 - (rows*cellS)/2;
    
    const mazeMap = [
      "111111111111111",
      "100000100000001",
      "101110101111101",
      "101000100000101",
      "101011111110101",
      "101000000010001",
      "101111111011101",
      "100000000000001",
      "111111111111111"
    ];
    
    const path = [
      [1,1], [1,2], [1,3], [1,4], [1,5], [2,5], [3,5], [3,4], [3,3], [4,3], [5,3], [5,4], [5,5], [5,6], [5,7],
      [5,8], [5,9], [4,9], [3,9], [3,10], [3,11], [2,11], [1,11], [1,12], [1,13], [2,13], [3,13], [4,13], [5,13], [6,13], [7,13]
    ];
    
    const t = Math.floor(frame / 4) % (path.length + 20);
    
    for(let r=0; r<rows; r++) {
      for(let c=0; c<cols; c++) {
        if (mazeMap[r][c] === '1') {
          ctx.fillStyle = "rgba(80, 80, 120, 0.4)";
          ctx.fillRect(startX + c*cellS, startY + r*cellS, cellS-1, cellS-1);
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
          ctx.strokeRect(startX + c*cellS, startY + r*cellS, cellS-1, cellS-1);
        }
      }
    }
    
    if (t > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = Math.max(1.5, cellS * 0.15);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for(let i=0; i<Math.min(t, path.length); i++) {
        const p = path[i];
        const px = startX + p[1]*cellS + cellS/2;
        const py = startY + p[0]*cellS + cellS/2;
        if (i===0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      
      if (t <= path.length) {
        const head = path[Math.max(0, t-1)];
        ctx.beginPath();
        const headR = Math.max(3, cellS * 0.3);
        ctx.arc(startX + head[1]*cellS + cellS/2, startY + head[0]*cellS + cellS/2, headR, 0, PI2);
        ctx.fillStyle = "#d8b4fe";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#d8b4fe";
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  function renderTwoPointers() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const arr = [2, 3, 5, 8, 12, 15, 18, 22, 27];
    const target = 20;
    const stepTime = 60;
    
    const t = Math.floor(frame / stepTime) % 10;
    let l = 0, r = arr.length - 1;
    for(let i=0; i<t; i++) {
      if (l >= r) break;
      let sum = arr[l] + arr[r];
      if (sum > target) r--;
      else if (sum < target) l++;
      else break;
    }
    
    const boxW = 35, boxH = 35;
    const startX = w/2 - (arr.length*boxW)/2;
    const startY = h/2 - boxH/2;
    
    for(let i=0; i<arr.length; i++) {
      let isL = (i === l), isR = (i === r);
      
      ctx.fillStyle = isL ? "rgba(59, 130, 246, 0.2)" : (isR ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.05)");
      ctx.strokeStyle = isL ? "#3b82f6" : (isR ? "#ef4444" : "rgba(255, 255, 255, 0.1)");
      ctx.lineWidth = isL || isR ? 2 : 1;
      
      if (isL || isR) { ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle; }
      
      ctx.beginPath();
      ctx.roundRect(startX + i*boxW, startY, boxW-4, boxH, 6);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = (isL || isR) ? "#fff" : "rgba(255, 255, 255, 0.6)";
      ctx.font = "14px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(arr[i], startX + i*boxW + (boxW-4)/2, startY + boxH/2);
      
      if (isL) { ctx.fillStyle = "#3b82f6"; ctx.fillText("L", startX + i*boxW + (boxW-4)/2, startY - 15); }
      if (isR) { ctx.fillStyle = "#ef4444"; ctx.fillText("R", startX + i*boxW + (boxW-4)/2, startY + boxH + 15); }
    }
  }

  function renderDSU() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const nodes = [
      {id: 1, x: -50, y: -40}, {id: 2, x: -20, y: -70}, {id: 3, x: 20, y: -30},
      {id: 4, x: -40, y: 30}, {id: 5, x: 20, y: 50}, {id: 6, x: 60, y: 10}
    ];
    const edges = [[0,1], [1,2], [3,4], [4,5], [2,5]];
    
    const t = Math.floor(frame / 40) % (edges.length + 3);
    const startX = w/2, startY = h/2;
    
    ctx.lineWidth = 2;
    for(let i=0; i<Math.min(t, edges.length); i++) {
      const u = nodes[edges[i][0]], v = nodes[edges[i][1]];
      ctx.beginPath();
      ctx.moveTo(startX + u.x, startY + u.y);
      ctx.lineTo(startX + v.x, startY + v.y);
      ctx.strokeStyle = i === t - 1 ? "#34d399" : "rgba(255, 255, 255, 0.2)";
      if (i === t - 1) { ctx.shadowBlur = 10; ctx.shadowColor = "#34d399"; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    for(let i=0; i<nodes.length; i++) {
      const n = nodes[i];
      ctx.beginPath();
      ctx.arc(startX + n.x, startY + n.y, 12, 0, PI2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fill();
      
      ctx.strokeStyle = "#a4cafe";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = "#fff";
      ctx.font = "12px var(--mono)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(n.id, startX + n.x, startY + n.y);
    }
  }

  function renderMatrixMultiply() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const startX = w/2 - 80, startY = h/2 - 25;
    
    const tRow = Math.floor(frame / 30) % 2;
    const tCol = Math.floor(frame / 30) % 2;
    
    const drawMat = (x, y, rows, cols, hlRow, hlCol, color) => {
      const s = 22;
      for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
          const isHL = (r === hlRow || c === hlCol);
          ctx.fillStyle = isHL ? color : "rgba(255, 255, 255, 0.05)";
          ctx.strokeStyle = isHL ? color : "rgba(255, 255, 255, 0.1)";
          if (isHL) { ctx.shadowBlur = 8; ctx.shadowColor = color; }
          ctx.beginPath(); ctx.rect(x + c*s, y + r*s, s-2, s-2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        }
      }
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x+4, y-2); ctx.lineTo(x-4, y-2); ctx.lineTo(x-4, y+rows*s); ctx.lineTo(x+4, y+rows*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+cols*s-6, y-2); ctx.lineTo(x+cols*s+2, y-2); ctx.lineTo(x+cols*s+2, y+rows*s); ctx.lineTo(x+cols*s-6, y+rows*s); ctx.stroke();
    };
    
    drawMat(startX, startY, 2, 2, tRow, -1, "rgba(59, 130, 246, 0.6)");
    ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.fillText("×", startX + 60, startY + 22);
    drawMat(startX + 75, startY, 2, 2, -1, tCol, "rgba(168, 85, 247, 0.6)");
    ctx.fillText("=", startX + 135, startY + 22);
    drawMat(startX + 150, startY, 2, 2, tRow, tCol, "rgba(52, 211, 153, 0.6)");
  }

  function renderGraphColoring() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const nodes = [
      {id: 0, x: -30, y: -30}, {id: 1, x: 30, y: -30},
      {id: 2, x: 0, y: 0},
      {id: 3, x: -30, y: 30}, {id: 4, x: 30, y: 30}
    ];
    const edges = [[0,2], [1,2], [3,2], [4,2], [0,1]]; 
    const t = Math.floor(frame / 60) % 7;
    const cx = w/2, cy = h/2;
    
    ctx.lineWidth = 2;
    for(let e of edges) {
      const u = nodes[e[0]], v = nodes[e[1]];
      ctx.beginPath(); ctx.moveTo(cx + u.x, cy + u.y); ctx.lineTo(cx + v.x, cy + v.y);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      if (t >= 5 && ((e[0]===0 && e[1]===1) || (e[0]===1 && e[1]===0))) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    for(let i=0; i<nodes.length; i++) {
      const n = nodes[i];
      ctx.beginPath(); ctx.arc(cx + n.x, cy + n.y, 12, 0, PI2);
      let c = "rgba(255, 255, 255, 0.1)";
      if (i < t) c = (i % 2 === 0) ? "rgba(239, 68, 68, 0.6)" : "rgba(59, 130, 246, 0.6)";
      if (i === 1 && t >= 5) c = "rgba(239, 68, 68, 0.8)"; 
      
      ctx.fillStyle = c;
      if (i < t) { ctx.shadowBlur = 10; ctx.shadowColor = c; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.stroke();
    }
  }

  function renderMoAlgorithm() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const arr = new Array(10).fill(0);
    const boxW = 20, boxH = 20;
    const startX = w/2 - (arr.length*boxW)/2;
    const startY = h/2 - 10;
    
    for(let i=0; i<arr.length; i++) {
      ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath(); ctx.rect(startX + i*boxW, startY, boxW-2, boxH); ctx.fill(); ctx.stroke();
    }
    
    const queries = [[1, 4], [1, 6], [2, 6], [5, 8], [0, 3]];
    const t = Math.floor(frame / 60) % queries.length;
    const q = queries[t];
    
    ctx.fillStyle = "rgba(168, 85, 247, 0.3)";
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10; ctx.shadowColor = "#a855f7";
    ctx.beginPath();
    ctx.roundRect(startX + q[0]*boxW, startY - 2, (q[1]-q[0]+1)*boxW - 2, boxH + 4, 4);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("L", startX + q[0]*boxW + boxW/2 - 1, startY - 8);
    ctx.fillText("R", startX + q[1]*boxW + boxW/2 - 1, startY + boxH + 12);
  }

  function renderSuffixArray() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const suffixes = ["a", "ana", "anana", "banana", "na", "nana"];
    const t = Math.floor(frame / 30) % (suffixes.length + 4);
    
    ctx.font = "14px var(--mono)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    
    const startX = w/2 - 25;
    const startY = h/2 - (suffixes.length*16)/2 + 8;
    
    for(let i=0; i<suffixes.length; i++) {
      const isHL = (i === t);
      ctx.fillStyle = isHL ? "#34d399" : "rgba(255,255,255,0.5)";
      if (isHL) { ctx.shadowBlur = 10; ctx.shadowColor = "#34d399"; }
      ctx.fillText(suffixes[i], startX, startY + i*16);
      ctx.shadowBlur = 0;
    }
  }


  // --- 5 MORE ANIMATIONS ---

  function renderAhoCorasick() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const cx = w/2, cy = h/2 - 20;
    const nodes = [
      {x: 0, y: 0}, 
      {x: -30, y: 30}, 
      {x: -30, y: 60}, 
      {x: 30, y: 30},  
      {x: 30, y: 60},  
      {x: 30, y: 90}   
    ];
    const trieEdges = [[0,1,'h'], [1,2,'e'], [0,3,'s'], [3,4,'h'], [4,5,'e']];
    const failEdges = [[1,0], [3,0], [4,1], [5,2], [2,0]]; 
    
    const t = Math.floor(frame / 60) % 6;
    
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    for(let i=0; i<failEdges.length; i++) {
      const e = failEdges[i];
      const u = nodes[e[0]], v = nodes[e[1]];
      ctx.beginPath();
      ctx.moveTo(cx + u.x, cy + u.y);
      ctx.quadraticCurveTo(cx + u.x + 30, cy + (u.y+v.y)/2, cx + v.x, cy + v.y);
      
      const isHL = (i === t - 1);
      ctx.strokeStyle = isHL ? "rgba(239, 68, 68, 0.8)" : "rgba(255, 255, 255, 0.1)";
      if (isHL) { ctx.shadowBlur = 10; ctx.shadowColor = "#ef4444"; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.setLineDash([]);
    
    ctx.lineWidth = 2;
    for(let e of trieEdges) {
      const u = nodes[e[0]], v = nodes[e[1]];
      ctx.beginPath(); ctx.moveTo(cx + u.x, cy + u.y); ctx.lineTo(cx + v.x, cy + v.y);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.stroke();
      
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(e[2], cx + (u.x+v.x)/2 + 10, cy + (u.y+v.y)/2);
    }
    
    for(let i=0; i<nodes.length; i++) {
      const n = nodes[i];
      ctx.beginPath(); ctx.arc(cx + n.x, cy + n.y, 8, 0, PI2);
      ctx.fillStyle = (i === t) ? "#3b82f6" : "rgba(0, 0, 0, 0.8)";
      if (i === t) { ctx.shadowBlur = 15; ctx.shadowColor = "#3b82f6"; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = (i === t) ? "#60a5fa" : "rgba(255, 255, 255, 0.3)";
      ctx.stroke();
    }
  }

  function renderSegmentTreeLazy() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const cx = w/2, cy = h/2 - 30;
    const nodes = [
      {x: 0, y: 0},
      {x: -40, y: 35}, {x: 40, y: 35},
      {x: -60, y: 70}, {x: -20, y: 70}, {x: 20, y: 70}, {x: 60, y: 70}
    ];
    const edges = [[0,1], [0,2], [1,3], [1,4], [2,5], [2,6]];
    
    const t = Math.floor(frame / 40) % 4;
    
    ctx.lineWidth = 2;
    for(let e of edges) {
      const u = nodes[e[0]], v = nodes[e[1]];
      ctx.beginPath(); ctx.moveTo(cx + u.x, cy + u.y); ctx.lineTo(cx + v.x, cy + v.y);
      const isPath = (t > 0 && e[0] === 0 && e[1] === 1);
      ctx.strokeStyle = isPath ? "#a855f7" : "rgba(255,255,255,0.15)";
      if(isPath) { ctx.shadowBlur = 10; ctx.shadowColor = "#a855f7"; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    for(let i=0; i<nodes.length; i++) {
      const n = nodes[i];
      ctx.beginPath(); ctx.arc(cx + n.x, cy + n.y, 10, 0, PI2);
      
      let fill = "rgba(0,0,0,0.8)";
      let stroke = "rgba(255,255,255,0.3)";
      if (i === 0 && t >= 0) { fill = "rgba(168, 85, 247, 0.4)"; stroke = "#c084fc"; }
      if (i === 1 && t >= 1) { fill = "rgba(168, 85, 247, 0.8)"; stroke = "#e879f9"; }
      
      ctx.fillStyle = fill;
      if (i === 1 && t >= 1) { ctx.shadowBlur = 15; ctx.shadowColor = "#e879f9"; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      
      if (i === 1 && t >= 2) {
        ctx.fillStyle = "#34d399";
        ctx.font = "11px sans-serif";
        ctx.fillText("+val", cx + n.x + 22, cy + n.y - 5);
      }
    }
  }

  function renderTarjanSCC() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const cx = w/2, cy = h/2;
    const nodes = [
      {x: -40, y: -20, scc: 1}, {x: -20, y: 30, scc: 1}, {x: -60, y: 20, scc: 1},
      {x: 20, y: -30, scc: 2}, {x: 50, y: -10, scc: 2},                         
      {x: 30, y: 40, scc: 3}                                                    
    ];
    const edges = [
      [0,1], [1,2], [2,0],
      [3,4], [4,3],        
      [1,3], [4,5], [2,5]  
    ];
    
    const t = Math.floor(frame / 60) % 5; 
    
    for(let e of edges) {
      const u = nodes[e[0]], v = nodes[e[1]];
      let isCross = (u.scc !== v.scc);
      let color = isCross ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.2)";
      if (t > u.scc && !isCross) {
        if (u.scc === 1) color = "rgba(239, 68, 68, 0.6)";
        if (u.scc === 2) color = "rgba(59, 130, 246, 0.6)";
      }
      ctx.beginPath(); ctx.moveTo(cx + u.x, cy + u.y); ctx.lineTo(cx + v.x, cy + v.y);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    }
    
    const sccColors = ["#ef4444", "#3b82f6", "#10b981"]; 
    
    for(let i=0; i<nodes.length; i++) {
      const n = nodes[i];
      ctx.beginPath(); ctx.arc(cx + n.x, cy + n.y, 10, 0, PI2);
      
      let fill = "rgba(0,0,0,0.8)";
      let stroke = "rgba(255,255,255,0.3)";
      if (t >= n.scc) {
        fill = sccColors[n.scc - 1] + "40"; 
        stroke = sccColors[n.scc - 1];
      }
      
      ctx.fillStyle = fill;
      if (t >= n.scc) { ctx.shadowBlur = 10; ctx.shadowColor = stroke; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = stroke; ctx.stroke();
    }
  }

  function renderMeetInTheMiddle() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const cx = w/2, cy = h/2;
    const left = [5, 12, 18, 25];
    const right = [3, 9, 15, 21, 30];
    
    const t = Math.floor(frame / 40) % left.length;
    
    ctx.font = "12px var(--mono)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    for(let i=0; i<left.length; i++) {
      let isHL = (i === t);
      ctx.fillStyle = isHL ? "rgba(168, 85, 247, 0.3)" : "rgba(255,255,255,0.05)";
      ctx.strokeStyle = isHL ? "#a855f7" : "rgba(255,255,255,0.2)";
      ctx.beginPath(); ctx.roundRect(cx - 60, cy - 40 + i*25, 40, 20, 4);
      if (isHL) { ctx.shadowBlur = 10; ctx.shadowColor = "#a855f7"; }
      ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      
      ctx.fillStyle = isHL ? "#fff" : "rgba(255,255,255,0.6)";
      ctx.fillText(left[i], cx - 40, cy - 30 + i*25);
    }
    
    const targets = [3, 2, 0, 0]; 
    const rightHL = targets[t];
    
    for(let j=0; j<right.length; j++) {
      let isHL = (j === rightHL);
      ctx.fillStyle = isHL ? "rgba(52, 211, 153, 0.3)" : "rgba(255,255,255,0.05)";
      ctx.strokeStyle = isHL ? "#34d399" : "rgba(255,255,255,0.2)";
      ctx.beginPath(); ctx.roundRect(cx + 20, cy - 50 + j*25, 40, 20, 4);
      if (isHL) { ctx.shadowBlur = 10; ctx.shadowColor = "#34d399"; }
      ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      
      ctx.fillStyle = isHL ? "#fff" : "rgba(255,255,255,0.6)";
      ctx.fillText(right[j], cx + 40, cy - 40 + j*25);
    }
    
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy - 30 + t*25);
    ctx.lineTo(cx + 20, cy - 40 + rightHL*25);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.setLineDash([4,4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function renderTernarySearch() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const cx = w/2, cy = h/2 + 30;
    
    ctx.beginPath();
    for(let x = -60; x <= 60; x++) {
      let y = (x*x) / 40;
      if (x === -60) ctx.moveTo(cx + x, cy - y);
      else ctx.lineTo(cx + x, cy - y);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    const step = Math.floor(frame / 60) % 5;
    
    let L = -60, R = 60;
    for(let i=0; i<step; i++) {
      let m1 = L + (R-L)/3;
      let m2 = R - (R-L)/3;
      if (Math.abs(m1) < Math.abs(m2)) R = m2; 
      else L = m1;
    }
    
    let m1 = L + (R-L)/3;
    let m2 = R - (R-L)/3;
    let y1 = (m1*m1)/40, y2 = (m2*m2)/40;
    
    const drawLine = (x, y, color, label) => {
      ctx.beginPath(); ctx.moveTo(cx + x, cy); ctx.lineTo(cx + x, cy - y);
      ctx.strokeStyle = color; ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
      
      ctx.beginPath(); ctx.arc(cx + x, cy - y, 5, 0, PI2);
      ctx.fillStyle = color; ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.fill(); ctx.shadowBlur = 0;
      
      ctx.fillStyle = "#fff"; ctx.font = "10px var(--mono)"; ctx.textAlign="center";
      ctx.fillText(label, cx + x, cy + 12);
    };
    
    drawLine(m1, y1, "#3b82f6", "m1");
    drawLine(m2, y2, "#ef4444", "m2");
    
    ctx.beginPath();
    ctx.moveTo(cx + L, cy + 2); ctx.lineTo(cx + R, cy + 2);
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 3; ctx.stroke();
  }

  function renderClockRollover() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const values = ["23:59:58", "23:59:59", "00:00:00", "00:00:01", "00:00:02"];
    const active = Math.floor(frame / 40) % values.length;
    ctx.fillStyle = "rgba(8,16,27,0.96)";
    ctx.strokeStyle = "rgba(100,200,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(w/2 - 68, 22, 136, 54, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffb74d";
    ctx.font = "700 24px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(values[active], w/2, 49);
    const y = 118, x1 = 26, x2 = w - 26;
    ctx.strokeStyle = "rgba(69,200,255,0.45)";
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    values.forEach((value, i) => {
      const x = x1 + ((x2 - x1) * i / (values.length - 1));
      drawGlow(x, y, i === active ? 5 : 3, i === active ? "rgba(255,183,77,1)" : "rgba(69,200,255,0.9)", i === active ? 14 : 0);
      ctx.fillStyle = i === active ? "#ffb74d" : "rgba(244,247,251,0.9)";
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.fillText(value, x, y + 18);
    });
  }

  function renderRobotPath() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    const rows = 5, cols = 5, size = Math.min(34, (w - 70) / cols, (h - 46) / rows);
    const sx = (w - cols * size) / 2;
    const sy = (h - rows * size) / 2 + 8;
    const blocked = new Set(["1,2", "2,2", "3,1"]);
    const route = [{r:0,c:0},{r:0,c:1},{r:0,c:2},{r:0,c:3},{r:1,c:3},{r:2,c:3},{r:3,c:3},{r:4,c:3},{r:4,c:4}];
    const progress = Math.floor(frame / 18) % route.length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        const hit = route.findIndex((p) => p.r === r && p.c === c);
        ctx.fillStyle = blocked.has(key) ? "rgba(100,116,139,0.35)" : (hit >= 0 && hit <= progress ? "rgba(80,227,164,0.2)" : "rgba(69,200,255,0.06)");
        ctx.strokeStyle = "rgba(100,180,220,0.34)";
        ctx.fillRect(sx + c * size + 1, sy + r * size + 1, size - 2, size - 2);
        ctx.strokeRect(sx + c * size + 1, sy + r * size + 1, size - 2, size - 2);
      }
    }
    ctx.strokeStyle = "rgba(80,227,164,0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    route.slice(0, progress + 1).forEach((p, i) => {
      const x = sx + (p.c + 0.5) * size, y = sy + (p.r + 0.5) * size;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    const robot = route[progress];
    drawGlow(sx + (robot.c + 0.5) * size, sy + (robot.r + 0.5) * size, Math.max(6, size * 0.22), "rgba(255,183,77,1)", 16);
    ctx.fillStyle = "#f4f7fb";
    ctx.font = "700 9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("S", sx + size * 0.5, sy - 8);
    ctx.fillText("G", sx + (cols - 0.5) * size, sy + rows * size + 10);
  }


  // --- 5 SPECIFIC ANIMATIONS (Prim, QuickSort, Kadane, Manacher, ActivitySelection) ---

  function renderPrim() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const nodes = [
      {id: 0, x: -60, y: -30}, {id: 1, x: 20, y: -50}, {id: 2, x: 70, y: -10},
      {id: 3, x: -40, y: 40}, {id: 4, x: 20, y: 50}, {id: 5, x: 70, y: 40}
    ];
    const allEdges = [
      [0,1], [0,3], [1,3], [1,4], [1,2], [2,5], [4,5], [3,4]
    ];
    const mstSequence = [
      {u: 0, v: 1}, {u: 1, v: 4}, {u: 4, v: 3}, {u: 1, v: 2}, {u: 2, v: 5}
    ];
    
    const t = Math.floor(frame / 60) % (mstSequence.length + 3);
    const cx = w/2, cy = h/2;
    
    ctx.lineWidth = 1.5;
    for(let e of allEdges) {
      const u = nodes[e[0]], v = nodes[e[1]];
      ctx.beginPath(); ctx.moveTo(cx + u.x, cy + u.y); ctx.lineTo(cx + v.x, cy + v.y);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.stroke();
    }
    
    ctx.lineWidth = 2.5;
    const visited = new Set();
    if (t >= 0) visited.add(0);
    
    for(let i=0; i<Math.min(t, mstSequence.length); i++) {
      const e = mstSequence[i];
      const u = nodes[e.u], v = nodes[e.v];
      visited.add(e.v);
      
      ctx.beginPath(); ctx.moveTo(cx + u.x, cy + u.y); ctx.lineTo(cx + v.x, cy + v.y);
      ctx.strokeStyle = (i === t - 1) ? "#34d399" : "rgba(52, 211, 153, 0.6)";
      if (i === t - 1) { ctx.shadowBlur = 10; ctx.shadowColor = "#34d399"; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    for(let i=0; i<nodes.length; i++) {
      const n = nodes[i];
      ctx.beginPath(); ctx.arc(cx + n.x, cy + n.y, 10, 0, PI2);
      
      let isVis = visited.has(n.id);
      let isLast = (t > 0 && t <= mstSequence.length && mstSequence[t-1].v === n.id);
      if (t === 0 && n.id === 0) isLast = true; 
      
      ctx.fillStyle = isLast ? "#34d399" : (isVis ? "rgba(52, 211, 153, 0.2)" : "rgba(0,0,0,0.8)");
      ctx.strokeStyle = isVis ? "#34d399" : "rgba(255,255,255,0.3)";
      if (isLast) { ctx.shadowBlur = 15; ctx.shadowColor = "#34d399"; }
      
      ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    }
  }

  function renderQuickSort() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const arr = [6, 3, 8, 5, 2, 9, 4, 7];
    const pivotIdx = 7;
    const pivotVal = arr[pivotIdx];
    
    const t = Math.floor(frame / 25) % (arr.length + 5);
    
    const boxW = 20, boxH = 40;
    const cx = w/2 - (arr.length * boxW)/2, cy = h/2;
    
    for(let i=0; i<arr.length; i++) {
      let isPivot = (i === pivotIdx);
      let isCurrent = (i === t && i < pivotIdx);
      let isSmaller = (i < t && arr[i] <= pivotVal);
      let isLarger = (i < t && arr[i] > pivotVal);
      
      let fill = "rgba(255, 255, 255, 0.05)";
      let stroke = "rgba(255, 255, 255, 0.2)";
      let offsetY = 0;
      
      if (isPivot) { fill = "rgba(239, 68, 68, 0.3)"; stroke = "#ef4444"; } 
      else if (isCurrent) { fill = "rgba(168, 85, 247, 0.5)"; stroke = "#c084fc"; offsetY = -5; } 
      else if (isSmaller) { fill = "rgba(52, 211, 153, 0.2)"; stroke = "#34d399"; offsetY = 15; } 
      else if (isLarger) { fill = "rgba(59, 130, 246, 0.2)"; stroke = "#3b82f6"; offsetY = -15; }
      
      ctx.beginPath();
      ctx.rect(cx + i*boxW, cy - boxH/2 + offsetY, boxW-2, boxH);
      ctx.fillStyle = fill;
      if (isCurrent || isPivot) { ctx.shadowBlur = 10; ctx.shadowColor = stroke; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = stroke; ctx.stroke();
    }
  }

  function renderKadane() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const arr = [-2, 1, -3, 4, -1, 2, 1, -5, 4];
    const boxW = 22, boxH = 22;
    const cx = w/2 - (arr.length * boxW)/2, cy = h/2 - 10;
    
    const t = Math.floor(frame / 30) % (arr.length + 3);
    let currentSum = 0;
    let maxSum = -9999;
    let bestL = 0, bestR = 0, tempL = 0;
    
    for(let i=0; i<Math.min(t, arr.length); i++) {
      if (currentSum < 0) { currentSum = 0; tempL = i; }
      currentSum += arr[i];
      if (currentSum > maxSum) { maxSum = currentSum; bestL = tempL; bestR = i; }
    }
    
    for(let i=0; i<arr.length; i++) {
      let isHL = (i >= bestL && i <= bestR && t > 0);
      let isCur = (i === t - 1);
      
      ctx.beginPath(); ctx.rect(cx + i*boxW, cy, boxW-2, boxH);
      ctx.fillStyle = isCur ? "rgba(168, 85, 247, 0.4)" : (isHL ? "rgba(52, 211, 153, 0.2)" : "rgba(255,255,255,0.05)");
      ctx.strokeStyle = isCur ? "#c084fc" : (isHL ? "#34d399" : "rgba(255,255,255,0.2)");
      if (isCur) { ctx.shadowBlur = 10; ctx.shadowColor = "#c084fc"; }
      ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
      
      ctx.fillStyle = "#fff"; ctx.font = "11px var(--mono)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(arr[i], cx + i*boxW + boxW/2 - 1, cy + boxH/2);
    }
    
    ctx.fillStyle = "#34d399";
    ctx.font = "14px sans-serif";
    ctx.fillText(`Max Sum: ${maxSum === -9999 ? 0 : maxSum}`, w/2, cy + 40);
  }

  function renderManacher() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const str = "babad";
    const centerIdx = 2; 
    const boxW = 25, boxH = 30;
    const cx = w/2 - (str.length * boxW)/2, cy = h/2;
    
    const t = Math.floor(frame / 40) % 4; 
    
    for(let i=0; i<str.length; i++) {
      let isCenter = (i === centerIdx);
      let inRadius = (t > 0 && Math.abs(i - centerIdx) <= t);
      let isCheck = (t > 0 && Math.abs(i - centerIdx) === t);
      
      ctx.beginPath(); ctx.rect(cx + i*boxW, cy - boxH/2, boxW-2, boxH);
      
      let fill = "rgba(255,255,255,0.05)";
      let stroke = "rgba(255,255,255,0.2)";
      if (isCenter) { fill = "rgba(59, 130, 246, 0.3)"; stroke = "#3b82f6"; }
      else if (inRadius) {
        if (isCheck && t === 2) { fill = "rgba(239, 68, 68, 0.3)"; stroke = "#ef4444"; } 
        else { fill = "rgba(52, 211, 153, 0.2)"; stroke = "#34d399"; }
      }
      
      ctx.fillStyle = fill;
      if (isCheck) { ctx.shadowBlur = 10; ctx.shadowColor = stroke; }
      ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
      
      ctx.fillStyle = "#fff"; ctx.font = "16px var(--mono)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(str[i], cx + i*boxW + boxW/2 - 1, cy);
    }
    
    if (t > 0) {
      ctx.beginPath();
      ctx.moveTo(cx + (centerIdx - t)*boxW + boxW/2, cy - boxH/2 - 5);
      ctx.quadraticCurveTo(cx + centerIdx*boxW + boxW/2, cy - boxH - 20, cx + (centerIdx + t)*boxW + boxW/2, cy - boxH/2 - 5);
      ctx.strokeStyle = t === 2 ? "#ef4444" : "#34d399";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function renderActivitySelection() {
    const w = getW(), h = getH();
    ctx.clearRect(0, 0, w, h);
    
    const activities = [
      {start: 1, end: 4}, {start: 3, end: 5}, {start: 0, end: 6},
      {start: 5, end: 7}, {start: 3, end: 9}, {start: 8, end: 11}
    ];
    
    const scale = 15;
    const cx = w/2 - (11*scale)/2, cy = h/2 - (activities.length*12)/2;
    
    const t = Math.floor(frame / 30) % (activities.length + 3);
    
    for(let i=0; i<activities.length; i++) {
      const a = activities[i];
      let isConsidered = (i <= t);
      let isSelected = false;
      let isConflict = false;
      
      let simEnd = -1;
      for(let j=0; j<=Math.min(i, t); j++) {
        if (activities[j].start >= simEnd) {
          if (j === i) isSelected = true;
          simEnd = activities[j].end;
        } else {
          if (j === i) isConflict = true;
        }
      }
      
      let fill = "rgba(255,255,255,0.05)", stroke = "rgba(255,255,255,0.1)";
      if (isConsidered) {
        if (isSelected) { fill = "rgba(52, 211, 153, 0.4)"; stroke = "#34d399"; }
        else if (isConflict) { fill = "rgba(100,100,100,0.3)"; stroke = "rgba(255,255,255,0.1)"; }
      }
      
      if (i === t) { ctx.shadowBlur = 10; ctx.shadowColor = stroke; }
      
      ctx.beginPath();
      ctx.roundRect(cx + a.start*scale, cy + i*14, (a.end - a.start)*scale, 8, 4);
      ctx.fillStyle = fill; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = stroke; ctx.stroke();
    }
  }

    if (!document.body.contains(canvas)) { cancelAnimationFrame(animationFrame); return; }
    
    const analysis = meta?.analysis || {};
    const tTags = (analysis.tags || []).join(" ").toLowerCase();
    const tTech = (analysis.kyThuat || []).join(" ").toLowerCase();
    const tTitle = (meta?.title || "").toLowerCase();
    const textToScan = tTitle + " " + tTags + " " + tTech + " " + (topic || "").toLowerCase();
    

    // Routing Logic (Ordered by specificity)
    if (/(clock|timeline)/i.test(textToScan)) { renderClockRollover(); frame++; if (shouldAnimate) animationFrame = requestAnimationFrame(loop); return; }
    if (/(robot|pathfinding|grid|path)/i.test(textToScan)) { renderRobotPath(); frame++; if (shouldAnimate) animationFrame = requestAnimationFrame(loop); return; }
    if (/(clock|đồng hồ|timeline)/i.test(textToScan)) renderClockRollover();
    else if (/(robot|pathfinding|đường đi|lưới)/i.test(textToScan)) renderRobotPath();
    if (/(maze|mê cung)/i.test(textToScan)) renderMazeDFS();
    else if (/(two pointers|hai con trỏ)/i.test(textToScan)) renderTwoPointers();
    else if (/(dsu|disjoint set|union find|tập hợp rời rạc)/i.test(textToScan)) renderDSU();
    else if (/(matrix exponentiation|nhân ma trận)/i.test(textToScan)) renderMatrixMultiply();
    else if (/(graph coloring|tô màu đồ thị|bipartite|đồ thị hai phía)/i.test(textToScan)) renderGraphColoring();
    else if (/(mo's algorithm|thuật toán mo|chia căn)/i.test(textToScan)) renderMoAlgorithm();
    else if (/(suffix array|mảng hậu tố|suffix automaton)/i.test(textToScan)) renderSuffixArray();

    else if (/(aho-corasick|aho corasick|chuỗi nhiều mẫu)/i.test(textToScan)) renderAhoCorasick();
    else if (/(lazy propagation|cập nhật đoạn|cập nhật khoảng)/i.test(textToScan)) renderSegmentTreeLazy();
    else if (/(scc|strongly connected components|tarjan|thành phần liên thông mạnh)/i.test(textToScan)) renderTarjanSCC();
    else if (/(meet in the middle|chia đôi tập)/i.test(textToScan)) renderMeetInTheMiddle();
    else if (/(ternary search|chặt tam phân)/i.test(textToScan)) renderTernarySearch();

    else if (/(kmp|z-algorithm|rabin-karp|tìm kiếm chuỗi|pattern matching)/i.test(textToScan)) renderKMP();
    else if (/(knapsack|cái túi|balo)/i.test(textToScan)) renderKnapsack();
    else if (/(dijkstra|shortest path|đường đi ngắn nhất)/i.test(textToScan)) renderDijkstra();
    else if (/(monotonic stack|ngăn xếp đơn điệu)/i.test(textToScan)) renderMonotonicStack();
    else if (/(graham scan|convex hull|bao lồi)/i.test(textToScan)) renderGrahamScan();
    else if (/(prim)/i.test(textToScan)) renderPrim();
    else if (/(kruskal|mst|dsu|disjoint set|cây khung)/i.test(textToScan)) renderKruskal();
    else if (/(sliding window|cửa sổ trượt|two pointers|hai con trỏ)/i.test(textToScan)) renderSlidingWindow();
    else if (/(binary search on answer|chặt nhị phân kết quả)/i.test(textToScan)) renderBinarySearchAnswer();
    else if (/(binary search|chặt nhị phân|tìm kiếm nhị phân)/i.test(textToScan)) renderBinarySearchAnswer();
    else if (/(flood fill|bfs|dfs|loang)/i.test(textToScan)) renderFloodFill();
    else if (/(lis|longest increasing subsequence|dãy con tăng)/i.test(textToScan)) renderLIS();
    else if (/(segment tree|cây phân đoạn|\bit\b)/i.test(textToScan)) renderSegmentTree();
    else if (/(fenwick|binary indexed tree|cây bit)/i.test(textToScan)) renderFenwickTree();
    else if (/(trie|prefix tree)/i.test(textToScan)) renderTrie();
    else if (/(n[\s-]*queens?|quân hậu)/i.test(textToScan)) renderNQueens();
    else if (/(hanoi|tháp hà nội)/i.test(textToScan)) renderHanoi();
    else if (/(prefix sum|mảng cộng dồn|tổng tiền tố)/i.test(textToScan)) renderPrefixSum();
    else if (/(bitmask|trạng thái bit|\bbit\b)/i.test(textToScan)) renderBitmask();
    else if (/(topological sort|sắp xếp topo)/i.test(textToScan)) renderTopologicalSort();
    else if (/(lca|lowest common ancestor)/i.test(textToScan)) renderLCA();
    else if (/(exponentiation|lũy thừa|mũ)/i.test(textToScan)) renderFastExponentiation();
    else if (/(sieve|sàng nguyên tố|nguyên tố|prime)/i.test(textToScan)) renderPrimeSieve();
    else if (/(max flow|luồng cực đại)/i.test(textToScan)) renderMaxFlow();
    else if (/(hoán vị|permutation)/i.test(textToScan)) renderPermutation();
    else if (/(backtracking|quay lui|tổ hợp|chỉnh hợp|combinatorics)/i.test(textToScan)) renderBacktracking();
    else if (/(queue|hàng đợi)/i.test(textToScan)) renderQueue();
    else if (/(stack|ngăn xếp)/i.test(textToScan)) renderStack();
    // Generalized categories
    else if (/(tham lam|greedy)/i.test(textToScan)) renderActivitySelection();
    else if (/(chia và trị|divide and conquer)/i.test(textToScan)) renderMergeSort();
    else if (/(dp|quy hoạch động|dynamic programming)/i.test(textToScan)) renderKnapsack();
    else if (/(graph|đồ thị|tree|cây)/i.test(textToScan)) renderFloodFill();
    else if (/(quick sort|quicksort)/i.test(textToScan)) renderQuickSort();
    else if (/(merge sort|sắp xếp|sort)/i.test(textToScan)) renderSorting();
    else if (/(chuỗi|string|xâu|palindrome|đối xứng|manacher)/i.test(textToScan)) renderManacher();
    else if (/(mảng|array|kadane|dãy con lớn nhất)/i.test(textToScan)) renderKadane();
    else if (/(sparse table|rmq|khoảng truy vấn|bảng thưa)/i.test(textToScan)) renderSparseTable();
    else if (/(floyd-warshall|floyd|all pairs shortest path|đường đi ngắn nhất mọi cặp)/i.test(textToScan)) renderFloydWarshall();
    else if (/(bipartite matching|kuhn|hungarian|ghép cặp cực đại|ghép cực đại)/i.test(textToScan)) renderBipartiteMatching();
    else if (/(heap|priority queue|hàng đợi ưu tiên|cây vun đống)/i.test(textToScan)) renderBinaryHeap();
    else if (/(sweep line|đường quét|closest pair|cặp điểm gần nhất)/i.test(textToScan)) renderSweepLine();
    else if (/(heavy-light decomposition|hld|phân rã heavy-light)/i.test(textToScan)) renderHLD();
    else if (/(hash table|bảng băm|hashmap|hashing|băm)/i.test(textToScan)) renderHashTable();
    else renderMathFallback();
    
    frame++;
    if (shouldAnimate) animationFrame = requestAnimationFrame(loop);
  }

  loop();

  return () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
  };
}
