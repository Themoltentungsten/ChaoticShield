// API client + shared types for the ChaoticShield backend.

export interface Features {
  entropy: number;
  edgeDensity: number;
  size: number;
  width: number;
  height: number;
  channels: number;
}

export interface Decision {
  label: string;
  rounds: number;
  seed: number;
  r: number;
  aes: boolean;
  reason: string;
  trace: { text: string; passed: boolean }[];
  overridden?: boolean;
}

export interface Metrics {
  entropyPlain: number;
  entropyCipher: number;
  entropyIdeal: number;
  corrPlain: number;
  corrCipher: number;
  npcr: number;
  npcrIdeal: number;
  uaci: number;
  uaciIdeal: number;
  psnrSelf?: number | string | null;
  histPlain: number[];
  histCipher: number[];
}

export interface KeyFile {
  scheme: string;
  version: number;
  lossless?: boolean;
  size?: number;
  width: number;
  height: number;
  channels: number;
  rounds: number;
  seed: number;
  r: number;
  imageHash: string;
  aes: { enabled: boolean; iv?: string; tag?: string; password?: string };
  sha256: string;
  features: Features;
  createdAt: string;
}

export interface EncryptResponse {
  stages: { preprocessed: string; permuted: string; cipher: string };
  cipherPng: string;
  keyFile: KeyFile;
  features: Features;
  decision: Decision;
  mode: "auto" | "manual";
  metrics: Metrics;
  timingMs: number;
  phaseTimings?: { phase: string; ms: number }[];
}

export interface SelectiveKeyFile {
  scheme: "selective-aes-256-gcm";
  version: number;
  width: number;
  height: number;
  channels: number;
  kdf: string;
  salt: string;
  regions: {
    x: number;
    y: number;
    width: number;
    height: number;
    iv: string;
    tag: string;
    dataLength: number;
    ciphertext: string;
    label?: string;
  }[];
  imageSha256: string;
  createdAt: string;
}

export function isSelectiveKey(obj: unknown): obj is SelectiveKeyFile {
  const k = obj as SelectiveKeyFile | null;
  return !!k && k.scheme === "selective-aes-256-gcm" && Array.isArray(k.regions) && typeof k.salt === "string";
}

export interface DecryptResponse {
  recovered: string;
  integrity: boolean;
  sha256: string;
  lossless: boolean;
  params: { rounds: number; seed: number; r: number; aes: boolean; width: number; height: number; channels: number };
  timingMs?: number;
  phaseTimings?: { phase: string; ms: number }[];
}

async function post<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      needsPassword?: boolean;
    };
    err.needsPassword = !!data.needsPassword;
    throw err;
  }
  return data as T;
}

export function encryptImage(
  image: File | Blob,
  opts: {
    mode: "auto" | "manual";
    rounds?: number;
    seed?: number;
    r?: number;
    aes?: boolean;
    password?: string;
    filename?: string;
  },
): Promise<EncryptResponse> {
  const form = new FormData();
  form.append("image", image, opts.filename || "image.png");
  form.append("mode", opts.mode);
  if (opts.mode === "manual") {
    form.append("rounds", String(opts.rounds ?? 3));
    form.append("seed", String(opts.seed ?? 0.45));
    form.append("r", String(opts.r ?? 3.99));
    form.append("aes", String(!!opts.aes));
    if (opts.password) form.append("password", opts.password);
  }
  return post<EncryptResponse>("/api/encrypt", form);
}

export function decryptImage(
  image: File,
  keyFile: File,
  password?: string,
): Promise<DecryptResponse> {
  const form = new FormData();
  form.append("image", image);
  form.append("key", keyFile);
  if (password) form.append("password", password);
  return post<DecryptResponse>("/api/decrypt", form);
}

export async function fetchSampleImage(): Promise<Blob> {
  const res = await fetch("/api/sample");
  if (!res.ok) throw new Error("Could not load the sample image");
  return res.blob();
}

export function downloadBase64Png(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
