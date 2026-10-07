// SSE-style streaming client for the "thinking" endpoints.
// The server writes `event: <name>\ndata: <json>\n\n` frames after a POST.

export type StreamEvent =
  | { type: "phase"; id: string; label: string }
  | { type: "thought"; text: string }
  | { type: "fact"; text: string }
  | { type: "trace"; text: string; passed: boolean }
  | { type: "decision"; label: string; reason: string; rounds: number; seed: number; r: number; aes: boolean }
  | { type: "stage"; name: string; image: string }
  | {
      type: "metric";
      name: string;
      value: number | string;
      before?: number;
      ideal: string;
      pass: boolean;
      unit?: string;
    }
  | { type: "timing"; phase: string; ms: number }
  | { type: "done"; payload: Record<string, unknown> }
  | { type: "error"; message: string; needsPassword?: boolean; integrity?: boolean };

export class StreamError extends Error {
  needsPassword?: boolean;
  constructor(message: string, opts?: { needsPassword?: boolean }) {
    super(message);
    this.needsPassword = opts?.needsPassword;
  }
}

async function readSse(
  res: Response,
  onEvent: (e: StreamEvent) => void,
): Promise<Record<string, unknown>> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new StreamError(data.error || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: Record<string, unknown> = {};

  const dispatch = (eventName: string, payload: Record<string, unknown>) => {
    switch (eventName) {
      case "phase":
        onEvent({ type: "phase", id: payload.id as string, label: payload.label as string });
        break;
      case "thought":
        onEvent({ type: "thought", text: payload.text as string });
        break;
      case "fact":
        onEvent({ type: "fact", text: payload.text as string });
        break;
      case "trace":
        onEvent({ type: "trace", text: payload.text as string, passed: !!payload.passed });
        break;
      case "decision":
        onEvent(payload as unknown as StreamEvent);
        break;
      case "stage":
        onEvent({ type: "stage", name: payload.name as string, image: payload.image as string });
        break;
      case "metric":
        onEvent(payload as unknown as StreamEvent);
        break;
      case "timing":
        onEvent({ type: "timing", phase: payload.phase as string, ms: payload.ms as number });
        break;
      case "done":
        final = payload;
        onEvent({ type: "done", payload });
        break;
      case "error":
        throw new StreamError(payload.message as string, { needsPassword: !!payload.needsPassword });
    }
  };

  const processFrame = (frame: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event: ")) eventName = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
    }
    if (!dataLines.length) return;
    const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    dispatch(eventName, payload);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (frame.trim()) processFrame(frame);
    }
  }
  if (buffer.trim()) processFrame(buffer);
  return final;
}

export async function encryptStream(
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
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
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
  const res = await fetch("/api/encrypt/stream", { method: "POST", body: form });
  await readSse(res, onEvent);
}

export async function decryptStream(
  image: File,
  keyFile: File,
  password: string | undefined,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  const form = new FormData();
  form.append("image", image);
  form.append("key", keyFile);
  if (password) form.append("password", password);
  const res = await fetch("/api/decrypt/stream", { method: "POST", body: form });
  await readSse(res, onEvent);
}
