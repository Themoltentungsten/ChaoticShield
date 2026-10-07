// ─────────────────────────────────────────────────────────────────────────────
// Tests for selective region encryption/decryption (AES-256-GCM).
// Run: node --test server/tests/selective-crypto.test.js
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptRegions, decryptRegions } from "../selective-crypto.js";

// Helper: create a small test image buffer (W×H×3 RGB)
function makeTestImage(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = i % 256;
  }
  return { buf, w, h, c: 3 };
}

describe("selective-crypto", () => {
  // ── Round-trip ─────────────────────────────────────────────────────────
  it("encrypt → decrypt produces pixel-exact recovery", () => {
    const { buf, w, h, c } = makeTestImage(100, 80);
    const regions = [
      { x: 10, y: 10, width: 30, height: 20, label: "PHONE_NUMBER" },
      { x: 50, y: 40, width: 25, height: 15, label: "EMAIL" },
    ];
    const password = "test-password-123";

    const { encryptedImage, metadata } = encryptRegions(buf, w, h, c, regions, password);

    // Encrypted image should differ from original in the region areas
    assert.notDeepStrictEqual(encryptedImage, buf, "encrypted image should differ from original");

    // Decrypt
    const { decryptedImage } = decryptRegions(encryptedImage, w, h, c, metadata, password);

    // Verify pixel-exact recovery
    assert.deepStrictEqual(decryptedImage, buf, "decrypted image should match original exactly");
  });

  // ── Single region ──────────────────────────────────────────────────────
  it("works with a single region", () => {
    const { buf, w, h, c } = makeTestImage(50, 50);
    const regions = [{ x: 5, y: 5, width: 20, height: 20, label: "AADHAAR" }];
    const password = "single-region-pw";

    const { encryptedImage, metadata } = encryptRegions(buf, w, h, c, regions, password);
    const { decryptedImage } = decryptRegions(encryptedImage, w, h, c, metadata, password);
    assert.deepStrictEqual(decryptedImage, buf);
  });

  // ── Wrong password ─────────────────────────────────────────────────────
  it("wrong password fails with auth error", () => {
    const { buf, w, h, c } = makeTestImage(60, 40);
    const regions = [{ x: 0, y: 0, width: 20, height: 20 }];

    const { encryptedImage, metadata } = encryptRegions(buf, w, h, c, regions, "correct-pw");

    assert.throws(
      () => decryptRegions(encryptedImage, w, h, c, metadata, "wrong-pw"),
      /password is incorrect|Decryption failed/,
      "should reject wrong password",
    );
  });

  // ── Tampered ciphertext ────────────────────────────────────────────────
  it("detects tampered ciphertext", () => {
    const { buf, w, h, c } = makeTestImage(60, 40);
    const regions = [{ x: 5, y: 5, width: 15, height: 10 }];
    const password = "tamper-test";

    const { encryptedImage, metadata } = encryptRegions(buf, w, h, c, regions, password);

    // Tamper with the ciphertext in metadata
    const tampered = JSON.parse(JSON.stringify(metadata));
    const ct = Buffer.from(tampered.regions[0].ciphertext, "base64");
    ct[0] ^= 0xff;
    tampered.regions[0].ciphertext = ct.toString("base64");

    assert.throws(
      () => decryptRegions(encryptedImage, w, h, c, tampered, password),
      /Decryption failed/,
      "should detect tampered ciphertext",
    );
  });

  // ── Tampered metadata (IV) ─────────────────────────────────────────────
  it("detects tampered IV", () => {
    const { buf, w, h, c } = makeTestImage(60, 40);
    const regions = [{ x: 5, y: 5, width: 15, height: 10 }];
    const password = "iv-tamper-test";

    const { encryptedImage, metadata } = encryptRegions(buf, w, h, c, regions, password);

    // Tamper with the IV
    const tampered = JSON.parse(JSON.stringify(metadata));
    tampered.regions[0].iv = crypto.randomBytes(12).toString("hex");

    assert.throws(
      () => decryptRegions(encryptedImage, w, h, c, tampered, password),
      /Decryption failed/,
      "should detect tampered IV",
    );
  });

  // ── Each region uses unique IV ─────────────────────────────────────────
  it("each region uses a unique random IV", () => {
    const { buf, w, h, c } = makeTestImage(100, 80);
    const regions = [
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 30, y: 30, width: 20, height: 20 },
      { x: 60, y: 60, width: 20, height: 20 },
    ];

    const { metadata } = encryptRegions(buf, w, h, c, regions, "unique-iv-test");
    const ivs = metadata.regions.map((r) => r.iv);
    const uniqueIvs = new Set(ivs);
    assert.equal(uniqueIvs.size, ivs.length, "all IVs should be unique");
  });

  // ── Empty regions rejected ─────────────────────────────────────────────
  it("rejects empty region list", () => {
    const { buf, w, h, c } = makeTestImage(50, 50);
    assert.throws(
      () => encryptRegions(buf, w, h, c, [], "pw"),
      /at least one region/i,
    );
  });

  // ── Missing password rejected ──────────────────────────────────────────
  it("rejects missing password", () => {
    const { buf, w, h, c } = makeTestImage(50, 50);
    assert.throws(
      () => encryptRegions(buf, w, h, c, [{ x: 0, y: 0, width: 10, height: 10 }], ""),
      /password is required/i,
    );
  });

  // ── Dimension mismatch ─────────────────────────────────────────────────
  it("rejects dimension mismatch on decrypt", () => {
    const { buf, w, h, c } = makeTestImage(50, 50);
    const regions = [{ x: 0, y: 0, width: 10, height: 10 }];
    const { encryptedImage, metadata } = encryptRegions(buf, w, h, c, regions, "pw");

    assert.throws(
      () => decryptRegions(encryptedImage, 60, 50, c, metadata, "pw"),
      /dimension mismatch/i,
    );
  });

  // ── Invalid metadata version ───────────────────────────────────────────
  it("rejects invalid metadata version", () => {
    const { buf, w, h, c } = makeTestImage(50, 50);
    assert.throws(
      () => decryptRegions(buf, w, h, c, { version: 99, scheme: "other" }, "pw"),
      /unsupported/i,
    );
  });

  // ── Region clamping ────────────────────────────────────────────────────
  it("clamps out-of-bounds regions to image dimensions", () => {
    const { buf, w, h, c } = makeTestImage(50, 50);
    // Region extends beyond image
    const regions = [{ x: 40, y: 40, width: 30, height: 30 }];

    // Should not throw — region gets clamped
    const { encryptedImage, metadata } = encryptRegions(buf, w, h, c, regions, "clamp-test");
    const { decryptedImage } = decryptRegions(encryptedImage, w, h, c, metadata, "clamp-test");
    assert.deepStrictEqual(decryptedImage, buf);
  });

  // ── Metadata has random salt ───────────────────────────────────────────
  it("generates a random salt per encryption", () => {
    const { buf, w, h, c } = makeTestImage(50, 50);
    const regions = [{ x: 0, y: 0, width: 10, height: 10 }];

    const { metadata: m1 } = encryptRegions(buf, w, h, c, regions, "salt-test");
    const { metadata: m2 } = encryptRegions(buf, w, h, c, regions, "salt-test");
    assert.notEqual(m1.salt, m2.salt, "salts should differ between encryptions");
  });
});
