// SQLite-backed accounts + history store (node:sqlite — no external deps).
// Data lives in server/data/chaoticshield.db.
//
// History is ONE root archive with exactly three logical subfolders:
//   History/ ┬─ cipher/    uploaded/encrypted cipher images (PNG)
//            ├─ key/       JSON key files
//            └─ recovered/ successfully decrypted images (PNG)
// PNG payloads are stored under server/data/history/<user>/; JSON key files
// live inline in the `payload` column.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data");
const HISTORY_DIR = path.join(DATA, "history");
fs.mkdirSync(HISTORY_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA, "chaoticshield.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 4000;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);

  CREATE TABLE IF NOT EXISTS history_records (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE,
    type TEXT NOT NULL CHECK(type IN ('encrypt', 'decrypt')),
    summary TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_user ON history_records(username, created_at DESC);

  CREATE TABLE IF NOT EXISTS history_thumbs (
    record_id TEXT NOT NULL REFERENCES history_records(id) ON DELETE CASCADE,
    pos INTEGER NOT NULL,
    file TEXT NOT NULL,
    PRIMARY KEY (record_id, pos)
  );

  CREATE TABLE IF NOT EXISTS history_files (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE,
    folder TEXT NOT NULL CHECK(folder IN ('cipher', 'key', 'recovered')),
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'png',
    size INTEGER NOT NULL DEFAULT 0,
    meta TEXT NOT NULL DEFAULT '{}',
    payload_file TEXT,
    payload TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_user_folder ON history_files(username, folder, created_at DESC);
`);

const safeJson = (s) => {
  try { return JSON.parse(s); } catch { return {}; }
};
const userDir = (username) => path.join(HISTORY_DIR, encodeURIComponent(username));

// ── legacy migration (users.json + old per-record history) ───────────────────
function migrateLegacyStore() {
  const USERS_FILE = path.join(DATA, "users.json");
  try {
    if (fs.existsSync(USERS_FILE)) {
      const legacy = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
      const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
      if (userCount === 0 && legacy && typeof legacy === "object") {
        for (const [name, u] of Object.entries(legacy)) {
          if (!u?.salt || !u?.hash) continue;
          try {
            const createdAt = u.createdAt || new Date().toISOString();
            db.prepare("INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)")
              .run(String(name), String(u.salt), String(u.hash), createdAt);
            const { id } = db.prepare("SELECT id FROM users WHERE username = ?").get(String(name));
            for (const t of u.tokens || []) {
              db.prepare("INSERT OR IGNORE INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)")
                .run(String(t), id, createdAt);
            }
          } catch (e) {
            console.warn(`migration: failed to import user ${name}:`, e.message);
          }
        }
      }
      fs.renameSync(USERS_FILE, USERS_FILE + ".migrated");
    }
  } catch (e) {
    console.warn("migration: users.json skipped:", e.message);
  }

  try {
    for (const entry of fs.readdirSync(HISTORY_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const recFile = path.join(HISTORY_DIR, entry.name, "records.json");
      if (!fs.existsSync(recFile)) continue;
      const username = decodeURIComponent(entry.name);
      const legacy = JSON.parse(fs.readFileSync(recFile, "utf8"));
      const existing = db.prepare("SELECT COUNT(*) AS n FROM history_records WHERE username = ?").get(username).n;
      if (existing === 0 && Array.isArray(legacy)) {
        for (const r of legacy) {
          if (!r?.id) continue;
          try {
            db.prepare("INSERT OR IGNORE INTO history_records (id, username, type, summary, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
              .run(
                String(r.id),
                username,
                r.type === "decrypt" ? "decrypt" : "encrypt",
                String(r.summary || "").slice(0, 200),
                JSON.stringify(r.detail || {}),
                r.createdAt || new Date().toISOString(),
              );
            (Array.isArray(r.thumbs) ? r.thumbs : []).forEach((t, pos) => {
              const file = path.basename(String(t));
              if (!/\.png$/.test(file)) return;
              db.prepare("INSERT OR IGNORE INTO history_thumbs (record_id, pos, file) VALUES (?, ?, ?)")
                .run(String(r.id), pos, file);
            });
          } catch (e) {
            console.warn("migration: failed to import history record:", e.message);
          }
        }
      }
      fs.renameSync(recFile, recFile + ".migrated");
    }
  } catch (e) {
    console.warn("migration: history skipped:", e.message);
  }

  // old per-record history → new History/{cipher,key,recovered} file model
  try {
    const usersWithRecords = db.prepare(
      "SELECT DISTINCT username FROM history_records",
    ).all();
    for (const { username } of usersWithRecords) {
      const fileCount = db.prepare(
        "SELECT COUNT(*) AS n FROM history_files WHERE username = ?",
      ).get(username).n;
      if (fileCount > 0) continue;
      const records = db.prepare(
        "SELECT id, type, summary, detail, created_at FROM history_records WHERE username = ? ORDER BY created_at ASC",
      ).all(username);
      const dir = userDir(username);
      fs.mkdirSync(dir, { recursive: true });
      const thumbStmt = db.prepare("SELECT file FROM history_thumbs WHERE record_id = ? ORDER BY pos ASC");
      const insFile = db.prepare(
        "INSERT OR IGNORE INTO history_files (id, username, folder, name, kind, size, meta, payload_file, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const r of records) {
        const base = baseName(r.summary) || `run-${String(r.id).slice(0, 6)}`;
        const thumbs = thumbStmt.all(r.id).map((t) => t.file).filter((f) => fs.existsSync(path.join(dir, f)));
        if (thumbs.length === 0 && !safeJsonSize(r.detail)) continue;
        const ins = (folder, name, kind, size, meta, payload_file, payload, created_at) =>
          insFile.run(Date.now().toString(36) + crypto.randomBytes(4).toString("hex"), username, folder, name, kind, size, meta, payload_file, payload, created_at);
        if (Object.keys(safeJson(r.detail)).length > 0) {
          ins("key", `${base}-key.json`, "json", Buffer.byteLength(String(r.detail)), r.detail, null, String(r.detail), r.created_at);
        }
        for (const [i, f] of thumbs.entries()) {
          const size = fs.statSync(path.join(dir, f)).size;
          if (r.type === "decrypt") {
            ins(i === 0 ? "cipher" : "recovered", `${base}${i === 0 ? "-cipher" : "-recovered"}.png`, "png", size, r.detail, f, null, r.created_at);
          } else {
            ins("cipher", `${base}-cipher.png`, "png", size, r.detail, f, null, r.created_at);
          }
        }
      }
    }
  } catch (e) {
    console.warn("migration: history→files skipped:", e.message);
  }
}

function baseName(summary) {
  const token = String(summary || "").split("·")[0].trim();
  return token.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 40) || null;
}
function safeJsonSize(s) {
  return Object.keys(safeJson(s)).length;
}

migrateLegacyStore();

// ── users ────────────────────────────────────────────────────────────────────
const MAX_TOKENS_PER_USER = 8;

export function createUser(username, password) {
  username = String(username || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
    return { error: "Username must be 3–24 letters, digits, dots, dashes or underscores." };
  }
  if (String(password).length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    return { error: "That username is already taken." };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)")
    .run(username, salt, hash, now);
  const { id } = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  db.prepare("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)")
    .run(token, id, now);
  return { token, username };
}

export function loginUser(username, password) {
  username = String(username || "").trim();
  const user = db.prepare("SELECT id, username, salt, hash FROM users WHERE username = ?").get(username);
  if (!user) return { error: "Unknown username or wrong password." };
  const hash = crypto.scryptSync(String(password), user.salt, 32);
  const expected = Buffer.from(user.hash, "hex");
  if (hash.length !== expected.length || !crypto.timingSafeEqual(hash, expected)) {
    return { error: "Unknown username or wrong password." };
  }
  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)").run(token, user.id, now);
  db.prepare(`
    DELETE FROM tokens WHERE user_id = ? AND token NOT IN (
      SELECT token FROM tokens WHERE user_id = ? ORDER BY created_at DESC, token DESC LIMIT ?
    )
  `).run(user.id, user.id, MAX_TOKENS_PER_USER);
  return { token, username: user.username };
}

export function userByToken(token) {
  if (!token) return null;
  const row = db.prepare("SELECT u.username AS username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?").get(String(token));
  return row?.username ?? null;
}

export function logoutToken(token) {
  if (!token) return;
  db.prepare("DELETE FROM tokens WHERE token = ?").run(String(token));
}

// ── History root archive: History/{cipher,key,recovered} ─────────────────────
const FOLDERS = ["cipher", "key", "recovered"];
const MAX_STORE_BYTES = 12 * 1024 * 1024;
const MAX_FILES_PER_FOLDER = 400;
const b64Bytes = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

function insertFile(username, { folder, name, kind, size, meta, payloadFile, payload, createdAt }) {
  const id = Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
  db.prepare(
    "INSERT INTO history_files (id, username, folder, name, kind, size, meta, payload_file, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, String(username), folder, name, kind, size, meta, payloadFile, payload, createdAt || new Date().toISOString());

  // trim oldest per folder
  const excess = db.prepare(
    "SELECT id, payload_file FROM history_files WHERE username = ? AND folder = ? ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?",
  ).all(String(username), folder, MAX_FILES_PER_FOLDER);
  const dir = userDir(username);
  for (const row of excess) {
    if (row.payload_file) fs.rmSync(path.join(dir, row.payload_file), { force: true });
    db.prepare("DELETE FROM history_files WHERE id = ?").run(row.id);
  }
  return id;
}

function writePngPayload(username, dataUrl, id) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || "");
  if (!m || b64Bytes(dataUrl) > MAX_STORE_BYTES) return null;
  const dir = userDir(username);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${id}.png`;
  fs.writeFileSync(path.join(dir, file), Buffer.from(m[1], "base64"));
  return file;
}

export function addHistory(username, record) {
  const rec = record || {};
  const base = baseName(rec.summary) || `run-${Date.now().toString(36)}`;
  const detail = rec.detail && typeof rec.detail === "object" ? rec.detail : {};
  const meta = JSON.stringify(detail).slice(0, 80000);
  const createdAt = new Date().toISOString();
  const created = [];

  // KEY subfolder — the JSON key file
  if (rec.keyFile && typeof rec.keyFile === "object") {
    const payload = JSON.stringify(rec.keyFile, (_k, v) => (v === Infinity ? "Infinity" : v));
    insertFile(username, {
      folder: "key",
      name: `${base}-key.json`,
      kind: "json",
      size: Buffer.byteLength(payload),
      meta,
      payloadFile: null,
      payload,
      createdAt,
    });
    created.push("key");
  }

  // CIPHER subfolder — the cipher image
  if (typeof rec.cipherImage === "string" && rec.cipherImage.startsWith("data:image/")) {
    const tmpId = crypto.randomBytes(6).toString("hex");
    const file = writePngPayload(username, rec.cipherImage, tmpId);
    if (file) {
      insertFile(username, {
        folder: "cipher",
        name: `encrypted_${base}.png`,
        kind: "png",
        size: b64Bytes(rec.cipherImage),
        meta,
        payloadFile: file,
        payload: null,
        createdAt,
      });
      created.push("cipher");
    }
  }

  // RECOVERED subfolder — the decrypted image
  if (typeof rec.recoveredImage === "string" && rec.recoveredImage.startsWith("data:image/")) {
    const tmpId = crypto.randomBytes(6).toString("hex");
    const file = writePngPayload(username, rec.recoveredImage, tmpId);
    if (file) {
      insertFile(username, {
        folder: "recovered",
        name: `recovered_${base}.png`,
        kind: "png",
        size: b64Bytes(rec.recoveredImage),
        meta,
        payloadFile: file,
        payload: null,
        createdAt,
      });
      created.push("recovered");
    }
  }

  return { ok: true, created };
}

function rowToFile(row, username) {
  const uname = encodeURIComponent(String(username));
  return {
    id: row.id,
    folder: row.folder,
    name: row.name,
    kind: row.kind,
    size: row.size,
    meta: safeJson(row.meta),
    src: row.payload_file ? `/api/history/${uname}/file/${row.payload_file}` : null,
    content: row.kind === "json" ? row.payload : null,
    createdAt: row.created_at,
  };
}

export function listHistoryFiles(username, folder) {
  const rows = folder && FOLDERS.includes(folder)
    ? db.prepare("SELECT * FROM history_files WHERE username = ? AND folder = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(String(username), folder, MAX_FILES_PER_FOLDER)
    : db.prepare("SELECT * FROM history_files WHERE username = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(String(username), MAX_FILES_PER_FOLDER * 3);
  return rows.map((r) => rowToFile(r, username));
}

export function historyFileCounts(username) {
  const rows = db.prepare(
    "SELECT folder, COUNT(*) AS n, MAX(created_at) AS newest FROM history_files WHERE username = ? GROUP BY folder",
  ).all(String(username));
  const out = Object.fromEntries(FOLDERS.map((f) => [f, { count: 0, newest: null }]));
  for (const r of rows) out[r.folder] = { count: r.n, newest: r.newest };
  return out;
}

const VALID_NAME = /^[^\\/:"*?<>|%]{1,80}$/;

export function renameHistoryFile(username, id, name) {
  const newName = String(name ?? "").trim();
  if (!VALID_NAME.test(newName)) {
    return { error: "Invalid filename (1–80 chars, no path or special characters)." };
  }
  const row = db.prepare("SELECT id FROM history_files WHERE id = ? AND username = ?").get(String(id), String(username));
  if (!row) return { error: "File not found." };
  db.prepare("UPDATE history_files SET name = ? WHERE id = ?").run(newName, row.id);
  return { ok: true, name: newName };
}

export function deleteHistoryFile(username, id) {
  const row = db.prepare("SELECT id, payload_file FROM history_files WHERE id = ? AND username = ?").get(String(id), String(username));
  if (!row) return { error: "File not found." };
  if (row.payload_file) fs.rmSync(path.join(userDir(username), row.payload_file), { force: true });
  db.prepare("DELETE FROM history_files WHERE id = ?").run(row.id);
  return { ok: true };
}

export function historyThumbPath(username, file) {
  const p = path.join(userDir(username), path.basename(file));
  return p.startsWith(userDir(username)) && fs.existsSync(p) ? p : null;
}
