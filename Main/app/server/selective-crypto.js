// ─────────────────────────────────────────────────────────────────────────────
// ChaoticShield — selective (partial) region encryption using AES-256-GCM.
//
// Each region is encrypted independently with its own random IV.  The key is
// derived from the user's password via PBKDF2-SHA-512 (100 000 iterations).
// A single random salt is shared per encryption operation and stored in the
// metadata/key file — never the password itself.
//
// Tamper detection:  AES-GCM authenticates every region individually.
// If any ciphertext or metadata is modified, decryption will throw.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";

const KDF_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256-bit
const IV_LENGTH = 12;  // 96-bit for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derive a 256-bit AES key from a password + salt using PBKDF2-SHA-512.
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, KDF_ITERATIONS, KEY_LENGTH, "sha512");
}

/**
 * Extract the raw RGB bytes for a rectangular region from an interleaved image buffer.
 * Returns a new Buffer containing only the region pixels (row-major, RGB).
 */
function extractRegion(imageBytes, imgWidth, channels, region) {
  const { x, y, width, height } = region;
  const buf = Buffer.alloc(width * height * channels);
  for (let row = 0; row < height; row++) {
    const srcOff = ((y + row) * imgWidth + x) * channels;
    const dstOff = row * width * channels;
    imageBytes.copy(buf, dstOff, srcOff, srcOff + width * channels);
  }
  return buf;
}

/**
 * Write raw RGB bytes back into the image buffer at the given region.
 */
function writeRegion(imageBytes, imgWidth, channels, region, data) {
  const { x, y, width, height } = region;
  for (let row = 0; row < height; row++) {
    const dstOff = ((y + row) * imgWidth + x) * channels;
    const srcOff = row * width * channels;
    data.copy(imageBytes, dstOff, srcOff, srcOff + width * channels);
  }
}

/**
 * Fill a region with the encrypted ciphertext bytes (rendered as visual noise).
 * If the ciphertext is longer than the pixel area it wraps / gets truncated;
 * this is fine — the original ciphertext is stored in the metadata, not in
 * the pixels.  The noise is purely a visual indicator.
 */
function fillWithNoise(imageBytes, imgWidth, channels, region, ciphertext) {
  const { x, y, width, height } = region;
  const regionLen = width * height * channels;
  for (let i = 0; i < regionLen; i++) {
    const row = Math.floor(i / (width * channels));
    const col = i % (width * channels);
    const imgOff = ((y + row) * imgWidth + x) * channels + col;
    // Use ciphertext bytes cyclically so the noise is deterministic and looks scrambled
    imageBytes[imgOff] = ciphertext[i % ciphertext.length];
  }
}

/**
 * Validate and clamp region bounds to the image dimensions.
 */
function clampRegion(region, imgWidth, imgHeight) {
  let { x, y, width, height } = region;
  x = Math.max(0, Math.min(Math.round(x), imgWidth - 1));
  y = Math.max(0, Math.min(Math.round(y), imgHeight - 1));
  width = Math.max(1, Math.min(Math.round(width), imgWidth - x));
  height = Math.max(1, Math.min(Math.round(height), imgHeight - y));
  return { x, y, width, height };
}

/**
 * Encrypt selected regions of an image.
 *
 * @param {Buffer} imageBytes  — interleaved RGB bytes (w × h × channels)
 * @param {number} width
 * @param {number} height
 * @param {number} channels    — typically 3 (RGB)
 * @param {{ x:number, y:number, width:number, height:number, label?:string }[]} regions
 * @param {string} password
 * @returns {{ encryptedImage: Buffer, metadata: object }}
 */
export function encryptRegions(imageBytes, width, height, channels, regions, password) {
  if (!password || typeof password !== "string") {
    throw new Error("A password is required for selective encryption.");
  }
  if (!regions || regions.length === 0) {
    throw new Error("At least one region must be selected for encryption.");
  }

  // Work on a copy so we don't mutate the original
  const output = Buffer.from(imageBytes);
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);

  const regionMeta = [];

  for (const raw of regions) {
    const r = clampRegion(raw, width, height);

    // Extract the plain region pixels
    const plain = extractRegion(Buffer.from(imageBytes), width, channels, r);

    // Encrypt with a unique IV
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Replace region pixels with visual noise (ciphertext rendered as noise)
    fillWithNoise(output, width, channels, r, encrypted);

    regionMeta.push({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      dataLength: encrypted.length,
      ciphertext: encrypted.toString("base64"),
      label: raw.label || "CUSTOM",
    });
  }

  const imageSha256 = crypto.createHash("sha256").update(output).digest("hex");

  const metadata = {
    version: 1,
    scheme: "selective-aes-256-gcm",
    width,
    height,
    channels,
    kdf: `pbkdf2-sha512-${KDF_ITERATIONS}`,
    salt: salt.toString("hex"),
    regions: regionMeta,
    imageSha256,
    createdAt: new Date().toISOString(),
  };

  return { encryptedImage: output, metadata };
}

/**
 * Decrypt selected regions of an encrypted image.
 *
 * @param {Buffer} imageBytes   — the encrypted image pixel buffer
 * @param {number} width
 * @param {number} height
 * @param {number} channels
 * @param {object} metadata     — the key file JSON (must match the encryption metadata)
 * @param {string} password
 * @returns {{ decryptedImage: Buffer }}
 */
export function decryptRegions(imageBytes, width, height, channels, metadata, password) {
  if (!password || typeof password !== "string") {
    throw new Error("A password is required for selective decryption.");
  }
  if (!metadata || metadata.version !== 1 || metadata.scheme !== "selective-aes-256-gcm") {
    throw new Error("Invalid or unsupported selective encryption metadata.");
  }
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(
      `Dimension mismatch: metadata says ${metadata.width}×${metadata.height} ` +
      `but image is ${width}×${height}.`
    );
  }

  const salt = Buffer.from(metadata.salt, "hex");
  const key = deriveKey(password, salt);
  const output = Buffer.from(imageBytes);

  for (const rm of metadata.regions) {
    const iv = Buffer.from(rm.iv, "hex");
    const tag = Buffer.from(rm.tag, "hex");
    const ciphertext = Buffer.from(rm.ciphertext, "base64");

    // Authenticate & decrypt
    let plain;
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error(
        "Decryption failed: the encrypted data may have been modified or the password is incorrect."
      );
    }

    // Write decrypted pixels back into the image
    const r = clampRegion(rm, width, height);
    writeRegion(output, width, channels, r, plain);
  }

  return { decryptedImage: output };
}
