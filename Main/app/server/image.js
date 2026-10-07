// Image I/O helpers — v2 keeps the image at NATIVE resolution and in COLOUR.
// The encryption round-trip is lossless: decrypting returns the exact decoded
// pixel array of the uploaded image (for a PNG upload that is the original
// image, bit for bit). PNG is used for cipher/recovered files so no
// re-compression noise is ever introduced.
import { Jimp } from "jimp";

// Decode any PNG/JPEG → interleaved RGB bytes at native size (alpha dropped).
export async function decodeImage(buffer) {
  const img = await Jimp.read(buffer);
  const { width: w, height: h, data } = img.bitmap; // RGBA
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
  }
  return { data: rgb, width: w, height: h, channels: 3 };
}

// Decode a cipher image respecting the channel count recorded in the key file
// (v1 keys were single-channel 256×256 grayscale).
export async function decodeCipher(buffer, channels = 3) {
  const img = await Jimp.read(buffer);
  const { width: w, height: h, data } = img.bitmap;
  const out = new Uint8Array(w * h * channels);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (channels === 1) {
      out[i] = r === g && g === b ? r : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    } else {
      out[i * channels] = r;
      out[i * channels + 1] = g;
      out[i * channels + 2] = b;
    }
  }
  return { data: out, width: w, height: h };
}

// Encode interleaved bytes (1 or 3 channels) → lossless PNG buffer.
export async function encodePng(bytes, w, h, channels = 3) {
  const img = new Jimp({ width: w, height: h });
  const { data } = img.bitmap;
  for (let i = 0; i < w * h; i++) {
    if (channels === 1) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = bytes[i];
    } else {
      data[i * 4] = bytes[i * 3];
      data[i * 4 + 1] = bytes[i * 3 + 1];
      data[i * 4 + 2] = bytes[i * 3 + 2];
    }
    data[i * 4 + 3] = 255;
  }
  return img.getBuffer("image/png");
}

// Synthetic COLOUR benchmark image so visitors can try the pipeline without
// uploading anything: gradient sky, sun, textured hills, a building.
export function makeSampleImage(w = 320, h = 240) {
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      // sky: blue vertical gradient
      let r = 60 + 50 * (1 - y / h);
      let g = 120 + 60 * (1 - y / h);
      let b = 200 + 40 * (1 - y / h);
      // sun
      const dx = x - w * 0.74, dy = y - h * 0.24;
      if (dx * dx + dy * dy < (h * 0.13) ** 2) { r = 255; g = 214; b = 90; }
      // hills with green texture
      const hill = h * 0.62 + 14 * Math.sin(x / 24) + 7 * Math.sin(x / 8);
      if (y > hill) {
        const t = Math.sin(x / 5) * Math.sin(y / 6);
        r = 40 + 20 * t; g = 120 + 45 * t; b = 45 + 15 * t;
      }
      // building
      if (x > w * 0.12 && x < w * 0.36 && y > h * 0.38 && y < h * 0.82) {
        r = 150; g = 120; b = 105;
        if (x % 16 < 7 && y % 18 < 8 && y > h * 0.43) { r = 250; g = 230; b = 140; } // lit windows
      }
      // red roof
      if (x > w * 0.10 && x < w * 0.38 && y > h * 0.34 && y <= h * 0.40) { r = 170; g = 45; b = 40; }
      px[i] = Math.max(0, Math.min(255, Math.round(r)));
      px[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      px[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  return { data: px, width: w, height: h, channels: 3 };
}
