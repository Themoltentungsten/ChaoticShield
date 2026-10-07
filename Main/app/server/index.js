// ─────────────────────────────────────────────────────────────────────────────
// ChaoticShield server — Express API + Vite dev middleware on a single port.
//   npm run dev [-- --port 7100 --host 0.0.0.0]   → API + HMR frontend
//   npm run build && npm start                    → API + built dist/
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

import {
  MAX_DIM, sha256, sha256Hex, encryptChaotic, decryptChaotic, aesEncrypt, aesDecrypt,
  deriveSeed, derivePermSeed, catForward, shufflePixels, diffuse, logisticStream,
  extractFeatures, selectParameters, shannonEntropy, adjacentCorrelation,
  histogram, npcrUaci, psnr, arnoldPeriod,
} from "./crypto.js";
import { decodeImage, decodeCipher, encodePng, makeSampleImage } from "./image.js";
import { encryptRegions, decryptRegions } from "./selective-crypto.js";
import { detectRegions } from "./gemini-detector.js";
import {
  createUser, loginUser, userByToken, logoutToken,
  addHistory, historyThumbPath,
  listHistoryFiles, historyFileCounts, renameHistoryFile, deleteHistoryFile,
} from "./store.js";

const bearer = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : (req.query.token || null);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── CLI args: forward host/port like a normal dev server ────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=")[1];
  return fallback;
}
const port = Number(arg("port", process.env.PORT || 7100));
const host = arg("host", process.env.HOST || "0.0.0.0");
const isProd = process.argv.includes("--prod") || process.env.NODE_ENV === "production";

const app = express();
app.use(express.json({ limit: "30mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const b64 = (buf) => `data:image/png;base64,${buf.toString("base64")}`;

// ── routes ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    scheme: "arnold-cat-map / chaotic-shuffle + logistic-map + aes-256-gcm",
    mode: "lossless RGB, native resolution",
    maxDim: MAX_DIM,
    period256: arnoldPeriod(256),
  });
});

app.get("/api/sample", async (_req, res, next) => {
  try {
    const s = makeSampleImage();
    const png = await encodePng(s.data, s.width, s.height, 3);
    res.type("png").send(png);
  } catch (e) { next(e); }
});

// ── accounts ─────────────────────────────────────────────────────────────────
app.post("/api/auth/signup", (req, res) => {
  const r = createUser(req.body?.username, req.body?.password);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});

app.post("/api/auth/login", (req, res) => {
  const r = loginUser(req.body?.username, req.body?.password);
  if (r.error) return res.status(401).json({ error: r.error });
  res.json(r);
});

app.get("/api/auth/me", (req, res) => {
  const username = userByToken(bearer(req));
  if (!username) return res.status(401).json({ error: "Not signed in." });
  res.json({ username });
});

app.post("/api/auth/logout", (req, res) => {
  logoutToken(bearer(req));
  res.json({ ok: true });
});

// ── History root archive: History/{cipher,key,recovered} ────────────────────
const requireUser = (req, res) => {
  const username = userByToken(bearer(req));
  if (!username) return res.status(401).json({ error: "Sign in to view your history." }), null;
  return username;
};

app.get("/api/history/files", (req, res) => {
  const username = requireUser(req, res);
  if (!username) return;
  const folder = req.query.folder ? String(req.query.folder) : undefined;
  if (folder && !["cipher", "key", "recovered"].includes(folder)) {
    return res.status(400).json({ error: "Unknown subfolder." });
  }
  res.json({ files: listHistoryFiles(username, folder) });
});

app.get("/api/history/counts", (req, res) => {
  const username = requireUser(req, res);
  if (!username) return;
  res.json({ counts: historyFileCounts(username) });
});

app.post("/api/history", (req, res) => {
  const username = requireUser(req, res);
  if (!username) return;
  res.json(addHistory(username, req.body || {}));
});

app.patch("/api/history/files/:id", (req, res) => {
  const username = requireUser(req, res);
  if (!username) return;
  const r = renameHistoryFile(username, req.params.id, req.body?.name);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});

app.delete("/api/history/files/:id", (req, res) => {
  const username = requireUser(req, res);
  if (!username) return;
  const r = deleteHistoryFile(username, req.params.id);
  if (r.error) return res.status(404).json({ error: r.error });
  res.json(r);
});

app.get("/api/history/:user/file/:file", (req, res) => {
  const username = userByToken(bearer(req));
  if (!username || username !== req.params.user) return res.status(401).json({ error: "Not authorized." });
  const p = historyThumbPath(username, req.params.file);
  if (!p) return res.status(404).json({ error: "Not found." });
  res.type("png").sendFile(p);
});

app.post("/api/encrypt", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });
    const t0 = performance.now();

    // 1–2. Input + decoding: native resolution, RGB channels (nothing discarded)
    const img = await decodeImage(req.file.buffer);
    const { data: plain, width: w, height: h, channels: c } = img;
    if (w > MAX_DIM || h > MAX_DIM) {
      return res.status(400).json({ error: `Image is ${w}×${h} — the limit is ${MAX_DIM}px per side. Resize it and try again.` });
    }
    const features = extractFeatures(plain, w, h, c);

    // 3. AI parameter selection (or manual override)
    const mode = req.body.mode === "manual" ? "manual" : "auto";
    let decision = selectParameters(features);
    let params = { rounds: decision.rounds, seed: decision.seed, r: decision.r };
    let aesFlag = decision.aes;
    if (mode === "manual") {
      const rounds = Math.min(192, Math.max(1, parseInt(req.body.rounds, 10) || 3));
      const seed = Math.min(0.99, Math.max(0.01, parseFloat(req.body.seed) || 0.45));
      const r = Math.min(4, Math.max(3.57, parseFloat(req.body.r) || 3.99));
      params = { rounds, seed, r };
      aesFlag = req.body.aes === "true";
      decision = { ...decision, overridden: true };
    }

    // 4–6. Hybrid chaotic key generation → confusion → diffusion
    const { cipher, permuted, imageDigest } = encryptChaotic(plain, w, h, c, params);

    // 6b. Optional AES-256-GCM layer over the chaotic cipher bytes
    let finalBytes = Buffer.from(cipher.buffer, cipher.byteOffset, cipher.length);
    let aesInfo = { enabled: false };
    let generatedPassword = null;
    if (aesFlag) {
      let password = req.body.password?.trim();
      if (!password) {
        generatedPassword = "CS-" + crypto.randomBytes(6).toString("hex");
        password = generatedPassword;
      }
      const enc = aesEncrypt(finalBytes, password);
      finalBytes = enc.data;
      aesInfo = { enabled: true, iv: enc.iv, tag: enc.tag };
    }

    const integrity = sha256Hex(finalBytes);

    const keyFile = {
      scheme: "hybrid-chaotic (confusion + logistic-map diffusion)" + (aesFlag ? " + aes-256-gcm" : ""),
      version: 2,
      lossless: true,
      width: w,
      height: h,
      channels: c,
      rounds: params.rounds,
      seed: params.seed,
      r: params.r,
      imageHash: imageDigest.toString("hex"),
      aes: generatedPassword ? { ...aesInfo, password: generatedPassword } : aesInfo,
      sha256: integrity,
      features,
      selectedParameters: mode === "auto" ? { rounds: params.rounds, seed: params.seed, r: params.r, aes: aesFlag, label: decision.label } : "manual",
      createdAt: new Date().toISOString(),
    };

    // 8. Performance evaluation
    const { npcr, uaci } = npcrUaci(plain, w, h, c, params);
    const finalGray = new Uint8Array(finalBytes.buffer, finalBytes.byteOffset, w * h * c);
    const [pngPreprocessed, pngPermuted, pngCipher] = await Promise.all([
      encodePng(plain, w, h, c), encodePng(permuted, w, h, c), encodePng(finalGray, w, h, c),
    ]);

    res.json({
      stages: {
        preprocessed: b64(pngPreprocessed),
        permuted: b64(pngPermuted),
        cipher: b64(pngCipher),
      },
      cipherPng: b64(pngCipher),
      keyFile,
      features,
      decision,
      mode,
      metrics: {
        entropyPlain: +shannonEntropy(plain).toFixed(4),
        entropyCipher: +shannonEntropy(finalGray).toFixed(4),
        entropyIdeal: 8,
        corrPlain: +adjacentCorrelation(plain, w, h, c).toFixed(4),
        corrCipher: +adjacentCorrelation(finalGray, w, h, c).toFixed(4),
        npcr, npcrIdeal: 99.6094,
        uaci, uaciIdeal: 33.4635,
        histPlain: histogram(plain),
        histCipher: histogram(finalGray),
      },
      timingMs: +(performance.now() - t0).toFixed(1),
    });
  } catch (e) { next(e); }
});

app.post("/api/decrypt", upload.fields([{ name: "image", maxCount: 1 }, { name: "key", maxCount: 1 }]), async (req, res, next) => {
  try {
    const imgFile = req.files?.image?.[0];
    const keyFileRaw = req.files?.key?.[0];
    if (!imgFile) return res.status(400).json({ error: "No cipher image uploaded." });
    if (!keyFileRaw) return res.status(400).json({ error: "No key file uploaded." });

    let key;
    try {
      key = JSON.parse(keyFileRaw.buffer.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Key file is not valid JSON." });
    }

    // v1 keys: 256×256 single-channel grayscale. v2: native size, RGB.
    const w = key.width || key.size || 256;
    const h = key.height || key.size || 256;
    const c = key.channels || 1;

    const decoded = await decodeCipher(imgFile.buffer, c);
    if (decoded.width !== w || decoded.height !== h) {
      return res.status(400).json({
        error: `Dimension mismatch: the key file expects a ${w}×${h} cipher but the uploaded image is ${decoded.width}×${decoded.height}.`,
      });
    }
    let bytes = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length);

    // 7. Integrity check first — a mismatch aborts the operation
    const digest = sha256Hex(bytes);
    if (key.sha256 && digest !== key.sha256) {
      return res.status(422).json({
        error: "Integrity check failed: the cipher image does not match the SHA-256 tag in the key file. The file may be corrupted or tampered with — decryption aborted.",
        integrity: false,
      });
    }

    // Optional AES layer
    if (key.aes?.enabled) {
      const password = req.body.password?.trim() || key.aes?.password;
      if (!password) {
        return res.status(400).json({ error: "This cipher is protected by the AES-256 layer. Enter the password to continue.", needsPassword: true });
      }
      try {
        bytes = aesDecrypt(bytes, password, key.aes.iv, key.aes.tag);
      } catch {
        return res.status(401).json({ error: "AES authentication failed — wrong password or corrupted cipher." });
      }
    }

    const cipherBytes = new Uint8Array(bytes.buffer, bytes.byteOffset, w * h * c);
    const recovered = decryptChaotic(cipherBytes, w, h, c, { rounds: key.rounds, seed: key.seed, r: key.r }, key.imageHash);
    const png = await encodePng(recovered, w, h, c);

    res.json({
      recovered: b64(png),
      integrity: true,
      sha256: digest,
      lossless: true,
      params: { rounds: key.rounds, seed: key.seed, r: key.r, aes: !!key.aes?.enabled, width: w, height: h, channels: c },
    });
  } catch (e) { next(e); }
});

// ── SSE streaming ("thinking") endpoints ─────────────────────────────────────
function openSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`: ok\n\n`);
  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  return { send, pause };
}

const b64Png = async (bytes, w, h, c) => b64(await encodePng(bytes, w, h, c));

app.post("/api/encrypt/stream", upload.single("image"), async (req, res, next) => {
  const { send, pause } = openSse(res);
  try {
    if (!req.file) { send("error", { message: "No image uploaded." }); return res.end(); }
    const t0 = performance.now();
    const stamp = () => +(performance.now() - t0).toFixed(1);
    const phaseTimings = [];
    const notePhase = (phase) => phaseTimings.push({ phase, ms: stamp() });

    // ── phase 1: input decode ────────────────────────────────────────────────
    send("phase", { id: "input", label: "Input decoding" });
    await pause(140);
    send("thought", { text: `Receiving ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB). Decoding at native resolution — no resize, no grayscale conversion.` });
    const img = await decodeImage(req.file.buffer);
    const { data: plain, width: w, height: h, channels: c } = img;
    if (w > MAX_DIM || h > MAX_DIM) {
      send("error", { message: `Image is ${w}×${h} — the limit is ${MAX_DIM}px per side. Resize it and try again.` });
      return res.end();
    }
    await pause(180);
    send("fact", { text: `Decoded: ${w} × ${h} px, ${c === 3 ? "RGB (3 interleaved channels)" : "grayscale"} → ${(w * h * c).toLocaleString()} bytes to protect.` });
    send("timing", { phase: "input", ms: stamp() }); notePhase("input");

    // ── phase 2: feature analysis ────────────────────────────────────────────
    send("phase", { id: "analysis", label: "Feature analysis" });
    await pause(160);
    send("thought", { text: "Scanning the plaintext. The decision tree needs three signals: Shannon entropy (how flat the histogram is), Sobel edge density (how much texture/detail), and the image size." });
    const features = extractFeatures(plain, w, h, c);
    await pause(200);
    send("fact", { text: `entropy = ${features.entropy.toFixed(4)} bits/byte (ideal random = 8.0000)` });
    send("fact", { text: `edge density = ${features.edgeDensity.toFixed(4)} (Sobel, threshold 60)` });
    send("fact", { text: `max dimension = ${features.size}px` });
    send("timing", { phase: "analysis", ms: stamp() }); notePhase("analysis");

    // ── phase 3: AI decision ─────────────────────────────────────────────────
    send("phase", { id: "decision", label: "Parameter selection" });
    await pause(160);
    const mode = req.body.mode === "manual" ? "manual" : "auto";
    if (mode === "auto") {
      send("thought", { text: "Running the decision tree over these features — evaluating one rule at a time…" });
    } else {
      send("thought", { text: "Manual override requested — evaluating the AI suggestion anyway, then applying the given parameters." });
    }
    const decisionAuto = selectParameters(features);
    for (const t of decisionAuto.trace) {
      await pause(120);
      send("trace", t);
    }
    await pause(180);

    let params = { rounds: decisionAuto.rounds, seed: decisionAuto.seed, r: decisionAuto.r };
    let aesFlag = decisionAuto.aes;
    let decision = decisionAuto;
    if (mode === "manual") {
      const rounds = Math.min(192, Math.max(1, parseInt(req.body.rounds, 10) || 3));
      const seed = Math.min(0.99, Math.max(0.01, parseFloat(req.body.seed) || 0.45));
      const r = Math.min(4, Math.max(3.57, parseFloat(req.body.r) || 3.99));
      params = { rounds, seed, r };
      aesFlag = req.body.aes === "true";
      decision = { ...decisionAuto, overridden: true };
      send("fact", { text: `AI would pick: k=${decisionAuto.rounds}, x₀=${decisionAuto.seed}, AES=${decisionAuto.aes ? "on" : "off"} ("${decisionAuto.label}")` });
      send("thought", { text: `Overridden by operator: k=${rounds}, x₀=${seed}, r=${r}, AES=${aesFlag ? "on" : "off"}.` });
    } else {
      send("decision", { label: decision.label, reason: decision.reason, ...params, aes: aesFlag });
    }
    send("timing", { phase: "decision", ms: stamp() }); notePhase("decision");

    // ── phase 4: hybrid key generation + confusion ───────────────────────────
    send("phase", { id: "confusion", label: "Confusion (permutation)" });
    await pause(150);
    const tConf = performance.now();
    const imageDigest = sha256(Buffer.from(plain.buffer, plain.byteOffset, plain.length));
    const effSeed = deriveSeed(params.seed, imageDigest);
    const permSeed = derivePermSeed(params.seed, imageDigest);
    send("thought", { text: `Hashing the plaintext with SHA-256 → ${imageDigest.toString("hex").slice(0, 16)}…. The digest is folded into the chaotic initial conditions, so a single flipped plaintext bit regenerates the entire key stream.` });
    await pause(200);
    send("fact", { text: `effective diffusion seed x₀ = ${effSeed.toFixed(12)} (base ${params.seed} + digest)` });
    send("fact", { text: `permutation seed x₀ = ${permSeed.toFixed(12)}` });
    send("thought", { text: w === h
      ? `Square ${w}×${h} grid → classic Arnold Cat Map: (x+y, x+2y) mod ${w}. Bijective (det = 1) with exact inverse, iterated ${params.rounds} times. Period at 256×256 is ${arnoldPeriod(256)}.`
      : `Rectangular ${w}×${h} grid → the cat map is not bijective here, so every round is a chaotic Fisher–Yates shuffle of all ${(w * h).toLocaleString()} pixels, driven by the logistic orbit. The swap list is replayed in reverse at decryption.` });
    const permuted = w === h
      ? catForward(plain, w, h, c, params.rounds)
      : shufflePixels(plain, w * h, c, params.rounds, permSeed, params.r);
    await pause(240);
    send("stage", { name: "permuted", image: await b64Png(permuted, w, h, c) });
    send("fact", { text: `Permutation done in ${(performance.now() - tConf).toFixed(1)} ms — every pixel moved, RGB channels travel with their pixel.` });
    send("timing", { phase: "confusion", ms: stamp() }); notePhase("confusion");

    // ── phase 5: diffusion ───────────────────────────────────────────────────
    send("phase", { id: "diffusion", label: "Diffusion (keystream)" });
    await pause(150);
    const tDiff = performance.now();
    send("thought", { text: `Generating the logistic-map keystream: x(n+1) = ${params.r} · x(n) · (1 − x(n)), 1000 transient iterations discarded, byte = ⌊x·2²⁴⌋ mod 256.` });
    send("thought", { text: "Two chained XOR passes over every byte — forward with ciphertext feedback, then backward. A change anywhere therefore avalanches in both directions." });
    const cipher = diffuse(permuted, effSeed, params.r);
    const ks = logisticStream(effSeed, params.r, 8);
    await pause(220);
    send("fact", { text: `first keystream bytes: [${Array.from(ks).join(", ")}] …` });
    send("stage", { name: "cipher-stages", image: await b64Png(cipher, w, h, c) });
    send("fact", { text: `Diffusion done in ${(performance.now() - tDiff).toFixed(1)} ms over ${(cipher.length / 1024).toFixed(1)} KB.` });
    send("timing", { phase: "diffusion", ms: stamp() }); notePhase("diffusion");

    // ── phase 6: optional AES ────────────────────────────────────────────────
    let finalBytes = Buffer.from(cipher.buffer, cipher.byteOffset, cipher.length);
    let aesInfo = { enabled: false };
    let generatedPassword = null;
    if (aesFlag) {
      send("phase", { id: "aes", label: "AES-256-GCM layer" });
      await pause(140);
      let password = req.body.password?.trim();
      if (!password) {
        generatedPassword = "CS-" + crypto.randomBytes(6).toString("hex");
        password = generatedPassword;
        send("thought", { text: "No operator password given — generating one and storing it in the key file." });
      } else {
        send("thought", { text: "Using the operator-supplied password." });
      }
      const enc = aesEncrypt(finalBytes, password);
      finalBytes = enc.data;
      aesInfo = { enabled: true, iv: enc.iv, tag: enc.tag };
      await pause(200);
      send("fact", { text: `key = SHA-256(password), iv = ${enc.iv.slice(0, 12)}…, auth tag = ${enc.tag.slice(0, 16)}…` });
      send("timing", { phase: "aes", ms: stamp() }); notePhase("aes");
    } else {
      send("thought", { text: "AES-256 second layer disabled for this image." });
    }

    // ── phase 7: integrity tag ───────────────────────────────────────────────
    send("phase", { id: "integrity", label: "Integrity tag" });
    await pause(140);
    const integrity = sha256Hex(finalBytes);
    send("thought", { text: "Stamping the final cipher bytes with a SHA-256 tag — the receiver verifies it before running any decryption." });
    await pause(160);
    send("fact", { text: `SHA-256(cipher) = ${integrity}` });
    send("timing", { phase: "integrity", ms: stamp() }); notePhase("integrity");

    // ── phase 8: self-test + security metrics ────────────────────────────────
    send("phase", { id: "evaluate", label: "Self-test & metrics" });
    await pause(140);
    send("thought", { text: "Running a full inverse round-trip in memory to prove losslessness, then measuring resistance to statistical and differential attacks…" });
    // Self-test inverts the chaotic layer only (the AES layer is separately
    // authenticated by its GCM tag); a bit-exact recovery proves losslessness.
    const recoveredCheck = decryptChaotic(cipher, w, h, c, params, imageDigest.toString("hex"));
    const psnrSelf = psnr(plain, recoveredCheck);
    const psnrJson = psnrSelf === Infinity ? "Infinity" : psnrSelf;
    await pause(200);
    send("fact", { text: psnrSelf === Infinity
      ? "Round-trip self-test: recovered array is bit-identical to the plaintext → PSNR = ∞ dB (lossless)."
      : `Round-trip self-test: PSNR = ${psnrSelf} dB.` });

    const { npcr, uaci } = npcrUaci(plain, w, h, c, params);
    const finalGray = new Uint8Array(finalBytes.buffer, finalBytes.byteOffset, w * h * c);
    const [pngPreprocessed, pngPermuted, pngCipher] = await Promise.all([
      encodePng(plain, w, h, c), encodePng(permuted, w, h, c), encodePng(finalGray, w, h, c),
    ]);
    const entropyPlain = +shannonEntropy(plain).toFixed(4);
    const entropyCipher = +shannonEntropy(finalGray).toFixed(4);
    const corrPlain = +adjacentCorrelation(plain, w, h, c).toFixed(4);
    const corrCipher = +adjacentCorrelation(finalGray, w, h, c).toFixed(4);
    await pause(220);
    send("metric", { name: "entropy", before: entropyPlain, value: entropyCipher, ideal: "8.0000", pass: entropyCipher >= 7.9 });
    send("metric", { name: "correlation", before: corrPlain, value: corrCipher, ideal: "0.0000", pass: Math.abs(corrCipher) < 0.05 });
    send("metric", { name: "npcr", value: npcr, ideal: "99.6094", pass: npcr >= 99.0, unit: "%" });
    send("metric", { name: "uaci", value: uaci, ideal: "33.4635", pass: Math.abs(uaci - 33.4635) < 1, unit: "%" });
    send("metric", { name: "psnr", value: psnrSelf === Infinity ? "∞" : psnrSelf, ideal: "∞ (lossless)", pass: psnrSelf === Infinity, unit: "dB" });
    send("timing", { phase: "evaluate", ms: stamp() }); notePhase("evaluate");

    const keyFile = {
      scheme: "hybrid-chaotic (confusion + logistic-map diffusion)" + (aesFlag ? " + aes-256-gcm" : ""),
      version: 2,
      lossless: true,
      width: w,
      height: h,
      channels: c,
      rounds: params.rounds,
      seed: params.seed,
      r: params.r,
      imageHash: imageDigest.toString("hex"),
      aes: generatedPassword ? { ...aesInfo, password: generatedPassword } : aesInfo,
      sha256: integrity,
      features,
      selectedParameters: mode === "auto" ? { rounds: params.rounds, seed: params.seed, r: params.r, aes: aesFlag, label: decision.label } : "manual",
      createdAt: new Date().toISOString(),
    };

    send("done", {
      stages: { preprocessed: b64(pngPreprocessed), permuted: b64(pngPermuted), cipher: b64(pngCipher) },
      cipherPng: b64(pngCipher),
      keyFile,
      features,
      decision,
      mode,
      metrics: {
        entropyPlain, entropyCipher, entropyIdeal: 8,
        corrPlain, corrCipher,
        npcr, npcrIdeal: 99.6094,
        uaci, uaciIdeal: 33.4635,
        psnrSelf: psnrJson,
        histPlain: histogram(plain),
        histCipher: histogram(finalGray),
      },
      timingMs: +stamp(),
      phaseTimings,
    });
    res.end();
  } catch (e) {
    console.error(e);
    send("error", { message: e.message || "Encryption failed" });
    res.end();
  }
});

app.post("/api/decrypt/stream", upload.fields([{ name: "image", maxCount: 1 }, { name: "key", maxCount: 1 }]), async (req, res, next) => {
  const { send, pause } = openSse(res);
  try {
    const t0 = performance.now();
    const stamp = () => +(performance.now() - t0).toFixed(1);
    const phaseTimings = [];
    const notePhase = (phase) => phaseTimings.push({ phase, ms: stamp() });
    const imgFile = req.files?.image?.[0];
    const keyFileRaw = req.files?.key?.[0];
    if (!imgFile) { send("error", { message: "No cipher image uploaded." }); return res.end(); }
    if (!keyFileRaw) { send("error", { message: "No key file uploaded." }); return res.end(); }

    send("phase", { id: "key", label: "Reading the key file" });
    await pause(160);
    let key;
    try {
      key = JSON.parse(keyFileRaw.buffer.toString("utf8"));
    } catch {
      send("error", { message: "Key file is not valid JSON." });
      return res.end();
    }
    const w = key.width || key.size || 256;
    const h = key.height || key.size || 256;
    const c = key.channels || 1;
    send("thought", { text: `Key file parsed: scheme "${key.scheme ?? "unknown"}", ${w}×${h}, ${c === 3 ? "RGB" : "grayscale"}, k=${key.rounds} rounds, x₀=${key.seed}, r=${key.r}.` });
    send("fact", { text: `AES-256 layer: ${key.aes?.enabled ? "enabled (GCM tag present)" : "off"} · plain-hash present: ${!!key.imageHash}` });
    send("timing", { phase: "key", ms: stamp() }); notePhase("key");

    send("phase", { id: "integrity", label: "Integrity verification" });
    await pause(150);
    const decoded = await decodeCipher(imgFile.buffer, c);
    if (decoded.width !== w || decoded.height !== h) {
      send("error", { message: `Dimension mismatch: the key file expects a ${w}×${h} cipher but the uploaded image is ${decoded.width}×${decoded.height}.` });
      return res.end();
    }
    send("thought", { text: `Decoded cipher ${decoded.width}×${decoded.height} — dimensions match the key file. Hashing the bytes and comparing against the recorded tag before touching any key material…` });
    let bytes = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length);
    const digest = sha256Hex(bytes);
    await pause(260);
    if (key.sha256 && digest !== key.sha256) {
      send("fact", { text: `computed SHA-256 = ${digest.slice(0, 32)}…` });
      send("fact", { text: `expected SHA-256 = ${key.sha256.slice(0, 32)}… — MISMATCH` });
      send("error", { message: "Integrity check failed: the cipher image does not match the SHA-256 tag in the key file. The file may be corrupted or tampered with — decryption aborted.", integrity: false });
      return res.end();
    }
    send("fact", { text: `SHA-256 verified: ${digest}` });
    send("timing", { phase: "integrity", ms: stamp() }); notePhase("integrity");

    if (key.aes?.enabled) {
      send("phase", { id: "aes", label: "AES-256-GCM unwrap" });
      await pause(140);
      const password = req.body.password?.trim() || key.aes?.password;
      if (!password) {
        send("error", { message: "This cipher is protected by the AES-256 layer. Enter the password to continue.", needsPassword: true });
        return res.end();
      }
      try {
        send("thought", { text: "Deriving the AES key from the password and verifying the GCM authentication tag…" });
        bytes = aesDecrypt(bytes, password, key.aes.iv, key.aes.tag);
        await pause(220);
        send("fact", { text: "GCM tag valid — outer layer stripped, chaotic cipher bytes recovered." });
        send("timing", { phase: "aes", ms: stamp() }); notePhase("aes");
      } catch {
        send("error", { message: "AES authentication failed — wrong password or corrupted cipher." });
        return res.end();
      }
    }

    send("phase", { id: "undiffuse", label: "Inverse diffusion" });
    await pause(140);
    const cipherBytes = new Uint8Array(bytes.buffer, bytes.byteOffset, w * h * c);
    send("thought", { text: "Re-deriving the same keystream from (x₀, r, plain-hash), then unwinding the two XOR passes in reverse order — backward pass first, forward pass second." });
    send("timing", { phase: "undiffuse", ms: stamp() }); notePhase("undiffuse");

    send("phase", { id: "unpermute", label: "Inverse confusion" });
    await pause(140);
    const recovered = decryptChaotic(cipherBytes, w, h, c, { rounds: key.rounds, seed: key.seed, r: key.r }, key.imageHash);
    send("thought", { text: w === h
      ? `Applying the inverse Arnold transform ${key.rounds} times: (2x′−y′, y′−x′) mod ${w}.`
      : `Replaying the chaotic Fisher–Yates swap list ${key.rounds} round(s) in reverse.` });
    await pause(240);
    send("stage", { name: "recovered", image: await b64Png(recovered, w, h, c) });
    send("timing", { phase: "unpermute", ms: stamp() }); notePhase("unpermute");

    const png = await encodePng(recovered, w, h, c);
    const pngRecovered = b64(png);
    send("done", {
      recovered: pngRecovered,
      integrity: true,
      sha256: digest,
      lossless: true,
      params: { rounds: key.rounds, seed: key.seed, r: key.r, aes: !!key.aes?.enabled, width: w, height: h, channels: c },
      timingMs: +stamp(),
      phaseTimings,
    });
    res.end();
  } catch (e) {
    console.error(e);
    send("error", { message: e.message || "Decryption failed" });
    res.end();
  }
});

// ── Selective (partial) encryption ───────────────────────────────────────────

// AI-powered sensitive-data detection (OpenAI-compatible endpoint or Gemini)
app.post("/api/selective/detect", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const img = await decodeImage(req.file.buffer);
    const { width: w, height: h } = img;

    if (w > MAX_DIM || h > MAX_DIM) {
      return res.status(400).json({ error: `Image is ${w}×${h} — the limit is ${MAX_DIM}px per side.` });
    }

    const { regions, detector } = await detectRegions(req.file.buffer, w, h);

    res.json({
      regions,
      width: w,
      height: h,
      detectorUsed: detector,
    });
  } catch (e) {
    console.error("AI detection error:", e);
    res.status(502).json({ error: e.message || "AI detection failed." });
  }
});

app.post("/api/selective/encrypt", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });
    const password = req.body.password?.trim();
    if (!password) return res.status(400).json({ error: "A password is required for selective encryption." });

    let regions;
    try {
      regions = JSON.parse(req.body.regions || "[]");
    } catch {
      return res.status(400).json({ error: "Invalid regions JSON." });
    }
    if (!Array.isArray(regions) || regions.length === 0) {
      return res.status(400).json({ error: "At least one region must be selected." });
    }

    const img = await decodeImage(req.file.buffer);
    const { data: plain, width: w, height: h, channels: c } = img;
    if (w > MAX_DIM || h > MAX_DIM) {
      return res.status(400).json({ error: `Image is ${w}×${h} — the limit is ${MAX_DIM}px per side.` });
    }

    const plainBuf = Buffer.from(plain.buffer, plain.byteOffset, plain.length);
    const { encryptedImage, metadata } = encryptRegions(plainBuf, w, h, c, regions, password);
    const pngBuf = await encodePng(new Uint8Array(encryptedImage), w, h, c);

    res.json({
      encryptedPng: `data:image/png;base64,${pngBuf.toString("base64")}`,
      keyFile: metadata,
    });
  } catch (e) { next(e); }
});

app.post("/api/selective/decrypt", upload.fields([{ name: "image", maxCount: 1 }, { name: "key", maxCount: 1 }]), async (req, res, next) => {
  try {
    const imgFile = req.files?.image?.[0];
    const keyFileRaw = req.files?.key?.[0];
    if (!imgFile) return res.status(400).json({ error: "No encrypted image uploaded." });
    if (!keyFileRaw) return res.status(400).json({ error: "No key file uploaded." });

    const password = req.body.password?.trim();
    if (!password) return res.status(400).json({ error: "A password is required for selective decryption." });

    let metadata;
    try {
      metadata = JSON.parse(keyFileRaw.buffer.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Key file is not valid JSON." });
    }

    if (!metadata || metadata.scheme !== "selective-aes-256-gcm") {
      return res.status(400).json({ error: "Key file is not a selective encryption key." });
    }

    const w = metadata.width;
    const h = metadata.height;
    const c = metadata.channels || 3;

    const decoded = await decodeCipher(imgFile.buffer, c);
    if (decoded.width !== w || decoded.height !== h) {
      return res.status(400).json({
        error: `Dimension mismatch: key expects ${w}×${h} but image is ${decoded.width}×${decoded.height}.`,
      });
    }

    const bytes = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length);

    let result;
    try {
      result = decryptRegions(bytes, w, h, c, metadata, password);
    } catch (err) {
      return res.status(401).json({ error: err.message });
    }

    const png = await encodePng(new Uint8Array(result.decryptedImage), w, h, c);
    res.json({
      decryptedPng: `data:image/png;base64,${png.toString("base64")}`,
      regionsDecrypted: metadata.regions.length,
    });
  } catch (e) { next(e); }
});

// JSON error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// API discoverability — never fall unknown /api/* paths through to the SPA
app.get("/api", (_req, res) => {
  res.json({
    ok: true,
    name: "ChaoticShield API",
    auth: "POST /api/auth/signup · POST /api/auth/login · GET /api/auth/me (Bearer token) · POST /api/auth/logout",
    crypto: "POST /api/encrypt · POST /api/encrypt/stream (SSE) · POST /api/decrypt · POST /api/decrypt/stream (SSE)",
    selective: "POST /api/selective/encrypt · POST /api/selective/decrypt",
    history: "GET /api/history/counts · GET /api/history/files?folder=cipher|key|recovered · POST /api/history · PATCH /api/history/files/:id · DELETE /api/history/files/:id",
    misc: "GET /api/health · GET /api/sample",
  });
});

app.use((req, res, next) => {
  if (!req.originalUrl.startsWith("/api/")) return next();
  res.status(404).json({
    error: `Unknown endpoint: ${req.method} ${req.originalUrl}`,
    hint: "GET /api lists the available endpoints.",
  });
});

// ── frontend: Vite middleware in dev, static dist/ in production ────────────
if (!isProd) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { port: port + 1000 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(dist, "index.html"), (e) => e && next(e));
  });
}

app.listen(port, host, () => {
  console.log(`ChaoticShield ${isProd ? "(prod)" : "(dev)"} → http://localhost:${port}/`);
});
