/**
 * Generates the PWA icon set without any native image dependency.
 *
 * Everything is rasterised into a raw RGBA buffer and encoded as a PNG using
 * only Node's built-in zlib — so `npm run icons` works on a clean checkout with
 * no sharp/canvas install step.
 *
 * Output: public/icons/icon-192.png, icon-512.png, maskable-512.png,
 *         public/apple-touch-icon.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public');

// --- minimal PNG encoder -----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace — all 0

  // Each scanline is prefixed with filter type 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing helpers ---------------------------------------------------------

const hex = (value) => {
  const n = parseInt(value.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const lerp = (a, b, t) => a + (b - a) * t;
const mixColor = (c1, c2, t) => [
  lerp(c1[0], c2[0], t),
  lerp(c1[1], c2[1], t),
  lerp(c1[2], c2[2], t),
];

class Canvas {
  constructor(size) {
    this.size = size;
    this.data = Buffer.alloc(size * size * 4);
  }

  /** Alpha-composites a colour over the existing pixel. */
  blend(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const a = Math.min(1, alpha);
    const dstA = this.data[i + 3] / 255;
    const outA = a + dstA * (1 - a);
    if (outA === 0) return;
    this.data[i] = (r * a + this.data[i] * dstA * (1 - a)) / outA;
    this.data[i + 1] = (g * a + this.data[i + 1] * dstA * (1 - a)) / outA;
    this.data[i + 2] = (b * a + this.data[i + 2] * dstA * (1 - a)) / outA;
    this.data[i + 3] = outA * 255;
  }

  /** Rounded-rect background fill. `radius` of size/2 gives a circle. */
  roundedRect(color, radius) {
    const { size } = this;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Distance outside the rounded rectangle, for a 1px antialiased edge.
        const dx = Math.max(radius - x - 0.5, x + 0.5 - (size - radius), 0);
        const dy = Math.max(radius - y - 0.5, y + 0.5 - (size - radius), 0);
        const dist = Math.hypot(dx, dy) - radius;
        const alpha = Math.min(1, Math.max(0, 0.5 - dist));
        this.blend(x, y, color, alpha);
      }
    }
  }

  /**
   * Draws an arc of `thickness`, sweeping `sweep` radians from `start`
   * (0 = 12 o'clock, clockwise), with a gradient between two colours.
   */
  arc({ cx, cy, radius, thickness, start, sweep, from, to, roundCaps = true }) {
    const outer = radius + thickness / 2;
    const inner = radius - thickness / 2;
    const x0 = Math.max(0, Math.floor(cx - outer - 2));
    const x1 = Math.min(this.size, Math.ceil(cx + outer + 2));
    const y0 = Math.max(0, Math.floor(cy - outer - 2));
    const y1 = Math.min(this.size, Math.ceil(cy + outer + 2));

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const px = x + 0.5 - cx;
        const py = y + 0.5 - cy;
        const dist = Math.hypot(px, py);

        // Angle measured clockwise from straight up.
        let angle = Math.atan2(px, -py);
        if (angle < 0) angle += Math.PI * 2;
        let delta = angle - start;
        if (delta < 0) delta += Math.PI * 2;

        const radialAlpha = Math.min(
          1,
          Math.max(0, Math.min(outer - dist, dist - inner) + 0.5)
        );
        if (radialAlpha <= 0) continue;

        let alpha = radialAlpha;
        let t = delta / sweep;

        if (delta > sweep) {
          if (!roundCaps) continue;
          // Round cap: distance to the end-point of the arc centre line.
          const endAngle = start + sweep;
          const ex = cx + Math.sin(endAngle) * radius;
          const ey = cy - Math.cos(endAngle) * radius;
          const capDist = Math.hypot(x + 0.5 - ex, y + 0.5 - ey);
          alpha = Math.min(1, Math.max(0, thickness / 2 - capDist + 0.5));
          if (alpha <= 0) continue;
          t = 1;
        }

        this.blend(x, y, mixColor(from, to, Math.min(1, Math.max(0, t))), alpha);
      }
    }
  }

  /** Filled circle with an antialiased edge. */
  dot(cx, cy, radius, color) {
    for (let y = Math.floor(cy - radius - 2); y <= Math.ceil(cy + radius + 2); y++) {
      for (let x = Math.floor(cx - radius - 2); x <= Math.ceil(cx + radius + 2); x++) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        this.blend(x, y, color, Math.min(1, Math.max(0, radius - dist + 0.5)));
      }
    }
  }
}

// --- the VitalSync mark ------------------------------------------------------

const BG = hex('#0b0f14');
const TRACK = hex('#1b2530');
const CYAN = hex('#38bdf8');
const GREEN = hex('#22c55e');

/**
 * @param size    output pixel size
 * @param inset   0-1 fraction of the canvas the artwork occupies. Maskable
 *                icons need the mark inside the middle 80% safe zone.
 * @param circle  true for a full-bleed circle (Apple touch icon looks better
 *                square, so it stays false there)
 */
function drawIcon(size, { inset = 1, radius = 0.22 } = {}) {
  const canvas = new Canvas(size);
  canvas.roundedRect(BG, size * radius);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.3 * inset;
  const thickness = size * 0.1 * inset;

  // Full track ring, then a ~78% progress sweep in the brand gradient.
  canvas.arc({
    cx,
    cy,
    radius: r,
    thickness,
    start: 0,
    sweep: Math.PI * 2 - 0.0001,
    from: TRACK,
    to: TRACK,
    roundCaps: false,
  });
  canvas.arc({
    cx,
    cy,
    radius: r,
    thickness,
    start: 0,
    sweep: Math.PI * 2 * 0.78,
    from: CYAN,
    to: GREEN,
  });

  // Heartbeat trace across the middle of the ring.
  const points = [
    [-0.62, 0], [-0.3, 0], [-0.16, -0.42], [0.02, 0.46], [0.2, -0.2], [0.34, 0], [0.62, 0],
  ];
  const strokeWidth = Math.max(1.5, size * 0.045 * inset);
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const steps = Math.ceil(size * 0.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      canvas.dot(
        cx + lerp(ax, bx, t) * r,
        cy + lerp(ay, by, t) * r,
        strokeWidth / 2,
        [232, 238, 245]
      );
    }
  }

  return encodePng(size, size, canvas.data);
}

// --- write files -------------------------------------------------------------

mkdirSync(resolve(publicDir, 'icons'), { recursive: true });

const outputs = [
  ['icons/icon-192.png', drawIcon(192)],
  ['icons/icon-512.png', drawIcon(512)],
  // Maskable: full-bleed background, artwork inside the 80% safe zone.
  ['icons/maskable-512.png', drawIcon(512, { inset: 0.78, radius: 0.5 })],
  ['apple-touch-icon.png', drawIcon(180, { radius: 0 })],
];

for (const [name, buffer] of outputs) {
  const path = resolve(publicDir, name);
  writeFileSync(path, buffer);
  console.log(`✓ ${name} (${(buffer.length / 1024).toFixed(1)} kB)`);
}

console.log('\nIcons written to public/. Re-run with `npm run icons` after changing the mark.');
