import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// CRC32 implementation for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCheck = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCheck), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generatePngBuffer(width, height) {
  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);

  // Background: #0f172a (15, 23, 42)
  // Inner ring: #10b981 (16, 185, 129)
  // Accent: #38bdf8 (56, 189, 248)
  // Accent center: #ffffff (255, 255, 255)

  const cx = width / 2;
  const cy = height / 2;
  const outerR = width * 0.32;
  const ringThickness = Math.max(2, width * 0.045);
  const cornerR = width * 0.22;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Rounded rectangle test
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const innerW = cx - cornerR;
      const innerH = cy - cornerR;

      let inBox = false;
      if (dx <= innerW || dy <= innerH) {
        inBox = dx < cx && dy < cy;
      } else {
        const cornerDx = dx - innerW;
        const cornerDy = dy - innerH;
        inBox = (cornerDx * cornerDx + cornerDy * cornerDy) <= (cornerR * cornerR);
      }

      if (!inBox) {
        // Transparent outside rounded corner
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Base background: Slate-900 with subtle gradient
      const gradFactor = 1.0 - (y / height) * 0.25;
      let r = Math.round(18 * gradFactor);
      let g = Math.round(26 * gradFactor);
      let b = Math.round(44 * gradFactor);
      let a = 255;

      const distFromCenter = Math.hypot(x - cx, y - cy);

      // Chronos Ring
      const ringDist = Math.abs(distFromCenter - outerR);
      if (ringDist <= ringThickness) {
        const alpha = Math.max(0, 1 - ringDist / ringThickness);
        // Emerald: 16, 185, 129
        r = Math.round(r * (1 - alpha) + 16 * alpha);
        g = Math.round(g * (1 - alpha) + 185 * alpha);
        b = Math.round(b * (1 - alpha) + 129 * alpha);
      }

      // Vertical Clock Hand (12 o'clock)
      if (Math.abs(x - cx) <= Math.max(2, width * 0.02) && y <= cy && y >= cy - outerR * 0.75) {
        r = 16; g = 185; b = 129;
      }

      // Horizontal Clock Hand (3 o'clock)
      if (Math.abs(y - cy) <= Math.max(2, width * 0.018) && x >= cx && x <= cx + outerR * 0.6) {
        r = 56; g = 189; b = 248;
      }

      // Center Pin
      if (distFromCenter <= Math.max(3, width * 0.035)) {
        r = 255; g = 255; b = 255;
      }

      // Sparkle Accent Dot (top right)
      const sparkleX = cx + outerR * 0.72;
      const sparkleY = cy - outerR * 0.72;
      const sparkleDist = Math.hypot(x - sparkleX, y - sparkleY);
      if (sparkleDist <= width * 0.05) {
        r = 56; g = 189; b = 248;
      }
      if (sparkleDist <= width * 0.02) {
        r = 255; g = 255; b = 255;
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace: None
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate files for public/ and dist/
const icons = [
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of icons) {
  const buf = generatePngBuffer(size, size);
  fs.writeFileSync(path.join(publicDir, file), buf);
  console.log(`Generated public/${file} (${size}x${size})`);
}
