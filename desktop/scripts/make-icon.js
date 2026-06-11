"use strict";

// make-icon.js — generates build/icon.ico (+ icon.png) with ZERO dependencies.
// Draws the USACO IDE "</>" mark so the desktop app has a branded icon.
// Run:  node scripts/make-icon.js

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 256;
const px = Buffer.alloc(SIZE * SIZE * 4); // RGBA, transparent

function setPx(x, y, r, g, b, a) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || a <= 0) return;
  const i = (y * SIZE + x) * 4;
  const da = px[i + 3] / 255, sa = a / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa);
  px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
  px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
  px[i + 3] = Math.round(oa * 255);
}

function roundedRect(x0, y0, w, h, rad, r, g, b) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const cx = x < x0 + rad ? x0 + rad : (x > x0 + w - 1 - rad ? x0 + w - 1 - rad : x);
      const cy = y < y0 + rad ? y0 + rad : (y > y0 + h - 1 - rad ? y0 + h - 1 - rad : y);
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rad) setPx(x, y, r, g, b, 255);
      else if (d <= rad + 1) setPx(x, y, r, g, b, Math.round((1 - (d - rad)) * 255));
    }
  }
}

function disk(cx, cy, rad, r, g, b) {
  for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) {
    for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rad) setPx(x, y, r, g, b, 255);
      else if (d <= rad + 1) setPx(x, y, r, g, b, Math.round((1 - (d - rad)) * 255));
    }
  }
}

function stroke(pts, th, r, g, b) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      disk(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, th / 2, r, g, b);
    }
  }
}

// ---- Draw: dark rounded tile + blue chevrons + light slash ----
roundedRect(0, 0, SIZE, SIZE, 52, 0x11, 0x18, 0x27);            // bg #111827
roundedRect(14, 14, SIZE - 28, SIZE - 28, 42, 0x1f, 0x29, 0x37); // inset #1f2937
stroke([[100, 78], [58, 128], [100, 178]], 17, 0x3b, 0x82, 0xf6); // <  blue
stroke([[156, 78], [198, 128], [156, 178]], 17, 0x3b, 0x82, 0xf6); // >  blue
stroke([[150, 70], [106, 186]], 15, 0xe2, 0xe8, 0xf0);             // /  light

// ---- Encode PNG (truecolor + alpha) ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function pngBuffer() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter: none
    px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const png = pngBuffer();

// ---- Wrap PNG in an ICO ----
function icoBuffer(pngData) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; entry[1] = 0; entry[2] = 0; entry[3] = 0; // 0 = 256px
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngData.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, pngData]);
}

const outDir = path.join(__dirname, "..", "build");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.png"), png);
fs.writeFileSync(path.join(outDir, "icon.ico"), icoBuffer(png));
console.log("Wrote build/icon.png (" + png.length + " bytes) and build/icon.ico");
