// Tiny RGBA PNG encoder/decoder + pixel canvas (no dependencies).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
};

const hex = (h, a = 255) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)).concat(255);

class Img {
  constructor(w, h) { this.w = w; this.h = h; this.px = Buffer.alloc(w * h * 4); }
  get(x, y) { const i = (y * this.w + x) * 4; return [...this.px.subarray(i, i + 4)]; }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return this;
    const i = (y * this.w + x) * 4, a = (c[3] ?? 255) / 255;
    if (a >= 1 || !this.px[i + 3]) { this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = c[3] ?? 255; return this; }
    for (let k = 0; k < 3; k++) this.px[i + k] = Math.round(c[k] * a + this.px[i + k] * (1 - a));
    this.px[i + 3] = 255;
    return this;
  }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  border(x, y, w, h, c) {
    for (let i = x; i < x + w; i++) { this.set(i, y, c); this.set(i, y + h - 1, c); }
    for (let j = y; j < y + h; j++) { this.set(x, j, c); this.set(x + w - 1, j, c); }
    return this;
  }
  /** Draw ASCII art; `pal` maps characters to colours, "." and " " are transparent. */
  art(x0, y0, rows, pal) { rows.forEach((row, y) => [...row].forEach((ch, x) => pal[ch] && this.set(x0 + x, y0 + y, pal[ch]))); return this; }
  noise(amt, seed = 1) {
    let s = seed * 7919 + 13;
    for (let k = 0; k < this.px.length; k += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      if (!this.px[k + 3]) continue;
      const d = ((s >> 16) % (amt * 2 + 1)) - amt;
      for (let c = 0; c < 3; c++) this.px[k + c] = Math.max(0, Math.min(255, this.px[k + c] + d));
    }
    return this;
  }
  /** Paste `src` scaled by integer `f` with its top-left at x,y (alpha blended). */
  paste(src, x, y, f = 1) {
    for (let j = 0; j < src.h * f; j++) for (let i = 0; i < src.w * f; i++) {
      const c = src.get(Math.floor(i / f), Math.floor(j / f));
      if (c[3]) this.set(x + i, y + j, c);
    }
    return this;
  }
  /** Rotate 90° clockwise `n` times (square images). */
  rotated(n = 1) {
    let src = this;
    for (let k = 0; k < ((n % 4) + 4) % 4; k++) {
      const o = new Img(src.h, src.w);
      for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(y, src.w - 1 - x));
      src = o;
    }
    return src === this ? this.scaled(1) : src;
  }
  scaled(f) { const o = new Img(this.w * f, this.h * f); o.paste(this, 0, 0, f); return o; }
  encode() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) this.px.copy(raw, y * (this.w * 4 + 1) + 1, y * this.w * 4, (y + 1) * this.w * 4);
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  }
  save(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, this.encode()); return this; }
}

function decode(file) {
  const b = fs.readFileSync(file);
  let p = 8, w, h; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString("ascii", p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); }
    if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, img = new Img(w, h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0, up = prev[i], c = i >= 4 ? prev[i - 4] : 0;
      const pr = () => { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? up : c; };
      line[i] = (line[i] + [0, a, up, (a + up) >> 1, pr()][f]) & 255;
    }
    line.copy(img.px, y * stride);
    prev = line;
  }
  return img;
}

module.exports = { Img, decode, hex, mix };
