// hires.js — optional supersampling for 4K masters. Load this BEFORE any other module (see player.html / player2.html).
//
//   player.html?film=coins&ss=2   → every canvas has ss × ss device pixels per logical pixel; scenes are not changed.
//
// How: every 2D canvas is "virtualised". Scene code keeps working in logical pixels (1920 × 1080 or 1080 × 1080) while the
// backing store is ss times larger, so everything drawn with paths, gradients, strokes and text is rasterised natively at
// the higher resolution. Things that are inherently per-pixel behave like this:
//   • getImageData returns LOGICAL-resolution data (box-averaged), putImageData accepts logical-resolution data (upscaled) —
//     so a scene's own per-pixel shading is computed at logical resolution and enlarged smoothly;
//   • code that wants native device pixels uses L.pixelCanvas / L.putRaw / L.getRaw in core.js (the library's own
//     generators — noiseTex, grainTex, bumpLight — do).
// With ss = 1 (the default) nothing is patched at all.
const SS = Math.max(1, Math.round(Number(new URLSearchParams(location.search).get('ss')) || 1));
globalThis.__GJ_SS = SS;
if (SS !== 1) install();

function install() {
  const C = HTMLCanvasElement.prototype, X = CanvasRenderingContext2D.prototype;
  const desc = (o, p) => Object.getOwnPropertyDescriptor(o, p);
  const wD = desc(C, 'width'), hD = desc(C, 'height');
  const n = {
    getContext: C.getContext, setTransform: X.setTransform, getTransform: X.getTransform, drawImage: X.drawImage,
    createPattern: X.createPattern, getImageData: X.getImageData, putImageData: X.putImageData, save: X.save, restore: X.restore,
    isPointInPath: X.isPointInPath, isPointInStroke: X.isPointInStroke, reset: X.reset, filter: desc(X, 'filter'),
    patSetTransform: CanvasPattern.prototype.setTransform, createImageBitmap: globalThis.createImageBitmap,
    bmW: desc(ImageBitmap.prototype, 'width'), bmH: desc(ImageBitmap.prototype, 'height'),
  };
  const base = (ctx) => n.setTransform.call(ctx, SS, 0, 0, SS, 0, 0);
  const isCanvas = (o) => o instanceof HTMLCanvasElement;
  const isV = (o) => isCanvas(o) || (o && o.__ss === true);

  // ── canvas size: logical outside, device inside ──
  for (const [prop, D, key] of [['width', wD, '__lw'], ['height', hD, '__lh']]) {
    Object.defineProperty(C, prop, { configurable: true, enumerable: true,
      get() { return this[key] !== undefined ? this[key] : D.get.call(this) / SS; },
      set(v) { v = Math.max(0, Number(v) || 0); this[key] = v; D.set.call(this, Math.max(1, Math.round(v * SS))); if (this.__ctx2d) base(this.__ctx2d); } });
  }
  C.getContext = function (type, ...rest) {
    const ctx = n.getContext.call(this, type, ...rest);
    if (ctx && type === '2d' && this.__ctx2d !== ctx) { this.__ctx2d = ctx; base(ctx); }
    return ctx;
  };

  // ── transforms: device = scale(SS) × user ──
  X.setTransform = function (a, b, c, d, e, f) {
    if (a !== null && typeof a === 'object') { const m = a; a = m.a ?? m.m11 ?? 1; b = m.b ?? m.m12 ?? 0; c = m.c ?? m.m21 ?? 0; d = m.d ?? m.m22 ?? 1; e = m.e ?? m.m41 ?? 0; f = m.f ?? m.m42 ?? 0; }
    else if (a === undefined) { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; }
    return n.setTransform.call(this, a * SS, b * SS, c * SS, d * SS, e * SS, f * SS);
  };
  X.resetTransform = function () { return base(this); };
  X.getTransform = function () { const m = n.getTransform.call(this); return new DOMMatrix([m.a / SS, m.b / SS, m.c / SS, m.d / SS, m.e / SS, m.f / SS]); };
  if (n.reset) X.reset = function () { n.reset.call(this); base(this); };

  // ── images: a canvas (or a bitmap made from one) counts as its LOGICAL size ──
  X.drawImage = function (img, ...a) {
    if (!isV(img)) return n.drawImage.call(this, img, ...a);
    if (a.length === 2) return n.drawImage.call(this, img, a[0], a[1], img.width, img.height);
    if (a.length === 4) return n.drawImage.call(this, img, a[0], a[1], a[2], a[3]);
    return n.drawImage.call(this, img, a[0] * SS, a[1] * SS, a[2] * SS, a[3] * SS, a[4], a[5], a[6], a[7]);
  };
  for (const [prop, D, key] of [['width', n.bmW, '__lw'], ['height', n.bmH, '__lh']]) {
    Object.defineProperty(ImageBitmap.prototype, prop, { configurable: true, enumerable: true, get() { return this.__ss ? this[key] : D.get.call(this); } });
  }
  globalThis.createImageBitmap = function (src, ...args) {
    const v = isV(src);
    if (v && args.length >= 4 && typeof args[0] === 'number') for (let i = 0; i < 4; i++) args[i] *= SS;
    const last = args.length ? args[args.length - 1] : null;
    if (v && last && typeof last === 'object' && (last.resizeWidth || last.resizeHeight)) {
      args[args.length - 1] = { ...last, ...(last.resizeWidth ? { resizeWidth: Math.round(last.resizeWidth * SS) } : {}), ...(last.resizeHeight ? { resizeHeight: Math.round(last.resizeHeight * SS) } : {}) };
    }
    return n.createImageBitmap.call(globalThis, src, ...args).then((bm) => {
      if (v) { bm.__lw = n.bmW.get.call(bm) / SS; bm.__lh = n.bmH.get.call(bm) / SS; bm.__ss = true; }
      return bm;
    });
  };
  X.createPattern = function (img, rep) {
    const p = n.createPattern.call(this, img, rep);
    if (p && isV(img)) { p.__ss = true; n.patSetTransform.call(p, new DOMMatrix([1 / SS, 0, 0, 1 / SS, 0, 0])); }
    return p;
  };
  CanvasPattern.prototype.setTransform = function (m) {
    if (!this.__ss) return n.patSetTransform.call(this, m);
    return n.patSetTransform.call(this, DOMMatrix.fromMatrix(m || {}).scale(1 / SS));
  };

  // ── things the current transform does not scale: filter lengths, shadows, hit-test coordinates ──
  const scalePx = (s, k) => (typeof s === 'string' ? s.replace(/(-?\d*\.?\d+(?:e-?\d+)?)px/g, (m, v) => +(parseFloat(v) * k).toFixed(4) + 'px') : s);
  Object.defineProperty(X, 'filter', { configurable: true, enumerable: true,
    get() { return scalePx(n.filter.get.call(this), 1 / SS); }, set(v) { n.filter.set.call(this, scalePx(v, SS)); } });
  for (const p of ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY']) {
    const D = desc(X, p);
    Object.defineProperty(X, p, { configurable: true, enumerable: true, get() { return D.get.call(this) / SS; }, set(v) { D.set.call(this, v * SS); } });
  }
  for (const [name, fn] of [['isPointInPath', n.isPointInPath], ['isPointInStroke', n.isPointInStroke]]) {
    X[name] = function (...a) { const i = typeof a[0] === 'number' ? 0 : 1; a[i] *= SS; a[i + 1] *= SS; return fn.apply(this, a); };
  }

  // ── per-pixel access in logical pixels ──
  X.getImageData = function (sx, sy, sw, sh, settings) {
    const W = Math.max(1, Math.round(sw)), H = Math.max(1, Math.round(sh));
    const src = n.getImageData.call(this, Math.round(sx * SS), Math.round(sy * SS), W * SS, H * SS, settings).data;
    if (W === 1 && H === 1) { const o1 = new ImageData(1, 1); o1.data.set(src.subarray(0, 4)); return o1; }
    const out = new ImageData(W, H), o = out.data, kk = SS * SS, stride = W * SS * 4;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let j = 0; j < SS; j++) {
          let p = (y * SS + j) * stride + x * SS * 4;
          for (let i = 0; i < SS; i++, p += 4) { const al = src[p + 3]; r += src[p] * al; g += src[p + 1] * al; b += src[p + 2] * al; a += al; }
        }
        if (a > 0) { const q = (y * W + x) * 4; o[q] = r / a; o[q + 1] = g / a; o[q + 2] = b / a; o[q + 3] = a / kk; }
      }
    }
    return out;
  };
  let tmp = null;
  X.putImageData = function (img, dx, dy, dirtyX, dirtyY, dirtyW, dirtyH) {
    if (!tmp) tmp = document.createElement('canvas');
    wD.set.call(tmp, img.width); hD.set.call(tmp, img.height);          // a raw canvas holding the data 1:1
    n.putImageData.call(n.getContext.call(tmp, '2d'), img, 0, 0);
    const x = Math.round(dx * SS), y = Math.round(dy * SS), w = img.width * SS, h = img.height * SS;
    const clip = new Path2D();
    if (dirtyW !== undefined) clip.rect(x + dirtyX * SS, y + dirtyY * SS, dirtyW * SS, dirtyH * SS); else clip.rect(x, y, w, h);
    n.save.call(this);
    n.setTransform.call(this, 1, 0, 0, 1, 0, 0);
    this.globalAlpha = 1; this.globalCompositeOperation = 'copy'; n.filter.set.call(this, 'none'); this.shadowColor = 'transparent';
    this.imageSmoothingEnabled = true; this.imageSmoothingQuality = 'high';
    this.clip(clip);
    n.drawImage.call(this, tmp, 0, 0, img.width, img.height, x, y, w, h);
    n.restore.call(this);
  };

  // ── native access for code that knows about device pixels (see L.pixelCanvas / L.putRaw / L.getRaw) ──
  globalThis.__GJ_RAW = {
    SS,
    put(canvas, img, dx = 0, dy = 0) { n.putImageData.call(canvas.getContext('2d'), img, dx, dy); },
    get(canvas, sx = 0, sy = 0, sw, sh) {
      const W = wD.get.call(canvas), H = hD.get.call(canvas);
      return n.getImageData.call(canvas.getContext('2d'), sx, sy, sw === undefined ? W - sx : sw, sh === undefined ? H - sy : sh);
    },
  };
}
