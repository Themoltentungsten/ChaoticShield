import { useState } from "react";
import {
  Check, FileKey, Loader2, LockOpen, ShieldCheck, ShieldX,
  Download, X, Timer, Sigma,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/SectionHeading";
import { ImageDrop } from "@/components/ImageDrop";
import { ThinkingConsole } from "@/components/ThinkingConsole";
import { downloadBase64Png, isSelectiveKey, type DecryptResponse, type KeyFile, type SelectiveKeyFile } from "@/lib/api";
import { decryptStream, StreamError, type StreamEvent } from "@/lib/stream";
import { useAuth } from "@/lib/auth";
import { saveHistoryRecord } from "@/lib/history";

export default function DecryptPage() {
  const { username, authFetch } = useAuth();
  const [cipher, setCipher] = useState<File | null>(null);
  const [cipherPreview, setCipherPreview] = useState<string | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [keyInfo, setKeyInfo] = useState<KeyFile | null>(null);
  const [selectiveKey, setSelectiveKey] = useState<SelectiveKeyFile | null>(null);
  const [selectiveResult, setSelectiveResult] = useState<{ decryptedPng: string; regionsDecrypted: number } | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [recoveredLive, setRecoveredLive] = useState<string | null>(null);
  const [result, setResult] = useState<DecryptResponse | null>(null);

  const pickCipher = (f: File) => {
    setCipher(f);
    setResult(null);
    setError(null);
    setEvents([]);
    setRecoveredLive(null);
    setSelectiveResult(null);
    const reader = new FileReader();
    reader.onload = () => setCipherPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const pickKey = async (f: File) => {
    setKeyFile(f);
    setResult(null);
    setError(null);
    setKeyError(null);
    setKeyInfo(null);
    setSelectiveKey(null);
    setEvents([]);
    setRecoveredLive(null);
    setSelectiveResult(null);
    try {
      const parsed = JSON.parse(await f.text());
      if (isSelectiveKey(parsed)) {
        // selective (region) keys decrypt through their own scheme below
        setSelectiveKey(parsed);
        return;
      }
      const chaotic = parsed as KeyFile;
      if (typeof chaotic.rounds !== "number" || typeof chaotic.seed !== "number" || !chaotic.imageHash) {
        throw new Error("missing fields");
      }
      setKeyInfo(chaotic);
    } catch {
      setKeyError("This file is not a valid ChaoticShield key file.");
    }
  };

  const saveHistory = async (res: DecryptResponse) => {
    if (!username) return;
    // files land in History/Cipher, History/Key and History/Recovered
    saveHistoryRecord(authFetch, {
      type: "decrypt",
      summary: `${cipher?.name} · recovered ${res.params.width}×${res.params.height} · integrity OK`,
      detail: { ...res.params },
      keyFile: keyInfo ? (keyInfo as unknown as Record<string, unknown>) : undefined,
      cipherImage: cipherPreview ?? undefined,
      recoveredImage: res.recovered,
    });
  };

  // Selective ciphers carry their own scheme — unwrap via the region endpoint
  const runSelective = async () => {
    if (!cipher || !keyFile || !selectiveKey || !password) return;
    setRunning(true);
    setError(null);
    setSelectiveResult(null);
    try {
      const form = new FormData();
      form.append("image", cipher);
      form.append("key", keyFile);
      form.append("password", password);
      const res = await fetch("/api/selective/decrypt", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Decryption failed");
      setSelectiveResult(data);
      // files land in History/Cipher, History/Key and History/Recovered
      saveHistoryRecord(authFetch, {
        type: "decrypt",
        summary: `${cipher.name} · selective · ${data.regionsDecrypted} regions restored`,
        detail: { scheme: selectiveKey.scheme, regions: data.regionsDecrypted, width: selectiveKey.width, height: selectiveKey.height },
        keyFile: selectiveKey as unknown as Record<string, unknown>,
        cipherImage: cipherPreview ?? undefined,
        recoveredImage: data.decryptedPng,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decryption failed");
    } finally {
      setRunning(false);
    }
  };

  const run = async () => {
    if (!cipher || !keyFile || running) return;
    if (selectiveKey) return runSelective();
    setRunning(true);
    setError(null);
    setResult(null);
    setEvents([]);
    setRecoveredLive(null);
    try {
      await decryptStream(cipher, keyFile, password || undefined, (e) => {
        setEvents((prev) => [...prev, e]);
        if (e.type === "stage" && e.name === "recovered") setRecoveredLive(e.image);
        if (e.type === "done") {
          const payload = e.payload as unknown as DecryptResponse;
          setResult(payload);
          void saveHistory(payload);
        }
      });
    } catch (e) {
      setError(e instanceof StreamError ? e.message : "Decryption failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        eyebrow="Workspace · receiver"
        title="Decrypt a cipher"
        sub="Upload the cipher image and its key file. The SHA-256 tag is verified before any key material is used — the integrity check narrates itself."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit rounded-2xl border-stone-800/80 bg-coal-900/40">
          <CardHeader className="border-b border-stone-800/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-[15px] text-stone-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold-500/25 bg-gold-500/10">
                <LockOpen className="h-3.5 w-3.5 text-gold-400" />
              </span>
              Receiver — decrypt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-stone-400">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/10 font-mono text-[10px] text-gold-300">1</span>
                Cipher image
              </p>
              <ImageDrop compact label="Drop cipher.png" file={cipher} previewUrl={cipherPreview} onFile={pickCipher} />
            </div>
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-stone-400">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/10 font-mono text-[10px] text-gold-300">2</span>
                Key file
              </p>
              <ImageDrop
                compact
                label="Drop chaoticshield.key.json"
                accept="application/json,.json"
                file={keyFile}
                previewUrl={null}
                onFile={pickKey}
              />
              {keyFile && !keyError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-gold-300">
                  <FileKey className="h-3.5 w-3.5" /> {keyFile.name}
                </p>
              )}
              {keyError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                  <X className="h-3.5 w-3.5" /> {keyError}
                </p>
              )}
            </div>

            {keyInfo && (
              <div className="rounded-xl border border-stone-800/70 bg-coal-950/70 p-3.5 font-mono text-[11px] leading-relaxed text-stone-400">
                <p className="mb-1.5 font-sans text-xs font-semibold uppercase tracking-wide text-stone-300">Key file contents</p>
                <p>rounds = <span className="text-gold-300">{keyInfo.rounds}</span> · x₀ = <span className="text-gold-300">{keyInfo.seed}</span> · r = <span className="text-gold-300">{keyInfo.r}</span></p>
                <p>AES-256 = <span className="text-gold-300">{keyInfo.aes.enabled ? "on" : "off"}</span> · {keyInfo.width}×{keyInfo.height} · {keyInfo.channels === 3 ? "RGB" : "gray"}</p>
                <p className="mt-1.5 break-all text-stone-600">sha256: {keyInfo.sha256.slice(0, 32)}…</p>
              </div>
            )}

            {selectiveKey && (
              <div className="rounded-xl border border-stone-800/70 bg-coal-950/70 p-3.5 font-mono text-[11px] leading-relaxed text-stone-400">
                <p className="mb-1.5 font-sans text-xs font-semibold uppercase tracking-wide text-stone-300">Key file contents</p>
                <p>scheme = <span className="text-gold-300">selective-aes-256-gcm</span></p>
                <p>{selectiveKey.regions.length} regions · {selectiveKey.width}×{selectiveKey.height} · {selectiveKey.channels === 3 ? "RGB" : "gray"}</p>
                <p className="mt-1.5 break-all text-stone-600">{selectiveKey.kdf} · salt {selectiveKey.salt.slice(0, 16)}…</p>
              </div>
            )}

            {(selectiveKey || (keyInfo?.aes.enabled && !keyInfo.aes.password)) && (
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-medium text-stone-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/10 font-mono text-[10px] text-gold-300">3</span>
                  {selectiveKey ? "Password" : "AES password"}
                </p>
                <Input
                  type="password"
                  placeholder={selectiveKey ? "Required for these regions" : "Required for this cipher"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border-stone-700 bg-coal-900 text-xs text-stone-200 placeholder:text-stone-600"
                />
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs leading-relaxed text-red-300">
                <ShieldX className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            <button
              className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 via-gold-400 to-gold-500 text-sm font-semibold text-coal-950 shadow-gold transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
              disabled={!cipher || !keyFile || !!keyError || running || (!!selectiveKey && !password)}
              onClick={run}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockOpen className="mr-2 h-4 w-4" />}
              {running ? "Verifying & decrypting…" : "Verify & decrypt"}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-stone-600">
              The SHA-256 tag is checked first — a corrupted or tampered cipher aborts the operation.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {events.length === 0 && !running && !selectiveResult && (
            <div className="bg-noise flex h-full min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-800 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/5">
                <LockOpen className="h-7 w-7 text-gold-500/50" />
              </span>
              <p className="text-sm text-stone-500">
                Upload the cipher image and its key file —
                <br />with the correct key the original image returns bit for bit.
              </p>
            </div>
          )}

          {(events.length > 0 || running) && (
            <ThinkingConsole events={events} running={running} title="Decryption pipeline — live reasoning" />
          )}

          {(recoveredLive || result) && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-6 rounded-2xl border border-stone-800/80 bg-coal-900/50 p-6 sm:flex-row">
                <div className="text-center">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Cipher in</p>
                  <img src={cipherPreview ?? ""} alt="cipher" className="h-44 w-44 rounded-xl border border-stone-800 bg-coal-950 object-cover" />
                </div>
                <div className="text-center font-mono text-[11px] leading-relaxed text-stone-500">
                  {result && (
                    <>
                      <p>inverse diffusion ×2</p>
                      <p>+ inverse confusion × {result.params.rounds} rounds</p>
                      {result.params.aes && <p>+ AES-256-GCM unwrap</p>}
                    </>
                  )}
                  <p className="mt-2 font-sans text-2xl text-gold-400">{recoveredLive ? "⟶" : "⋯"}</p>
                </div>
                <div className="text-center">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gold-400">
                    Recovered{result ? ` — lossless ${result.params.width}×${result.params.height}` : ""}
                  </p>
                  <img
                    src={result?.recovered ?? recoveredLive ?? ""}
                    alt="recovered"
                    className="h-44 w-44 rounded-xl border border-gold-500/40 object-cover shadow-gold-sm"
                  />
                </div>
                {result && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg border-stone-700 bg-transparent text-stone-200 transition-colors hover:border-gold-500/40 hover:bg-coal-800 sm:ml-auto sm:self-end"
                    onClick={() => downloadBase64Png(result.recovered, "recovered.png")}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> recovered.png
                  </Button>
                )}
              </div>

              {result && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-2.5 rounded-2xl border border-gold-500/25 bg-gold-500/5 p-3.5">
                    <Sigma className="h-4 w-4 shrink-0 text-gold-400" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-stone-500">PSNR</p>
                      <p className="font-mono text-sm font-bold text-gold-300">∞ dB · lossless</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-stone-800/80 bg-coal-900/50 p-3.5">
                    <Timer className="h-4 w-4 shrink-0 text-gold-500/70" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-stone-500">Exec time</p>
                      <p className="font-mono text-sm font-bold text-stone-100">{result.timingMs ?? 0} ms</p>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-2.5 rounded-2xl border border-stone-800/80 bg-coal-900/50 p-3.5 sm:col-span-1">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-gold-400" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-stone-500">SHA-256 verified</p>
                      <p className="flex items-center gap-1 truncate font-mono text-xs text-stone-300">
                        {result.sha256.slice(0, 18)}…
                        <Check className="h-3 w-3 shrink-0 text-gold-400" />
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectiveResult && (
            <div className="flex flex-col items-center gap-6 rounded-2xl border border-stone-800/80 bg-coal-900/50 p-6 sm:flex-row">
              <div className="text-center">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Cipher in</p>
                <img src={cipherPreview ?? ""} alt="cipher" className="h-44 w-44 rounded-xl border border-stone-800 bg-coal-950 object-cover" />
              </div>
              <div className="text-center font-mono text-[11px] leading-relaxed text-stone-500">
                <p>AES-256-GCM unwrap</p>
                <p>× {selectiveResult.regionsDecrypted} region{selectiveResult.regionsDecrypted !== 1 ? "s" : ""}</p>
                <p className="mt-2 font-sans text-2xl text-gold-400">⟶</p>
              </div>
              <div className="text-center">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gold-400">Recovered</p>
                <img src={selectiveResult.decryptedPng} alt="recovered" className="h-44 w-44 rounded-xl border border-gold-500/40 object-cover shadow-gold-sm" />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg border-stone-700 bg-transparent text-stone-200 transition-colors hover:border-gold-500/40 hover:bg-coal-800 sm:ml-auto sm:self-end"
                onClick={() => downloadBase64Png(selectiveResult.decryptedPng, "recovered-selective.png")}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> recovered-selective.png
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
