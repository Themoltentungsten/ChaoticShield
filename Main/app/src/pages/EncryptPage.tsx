import { useMemo, useState } from "react";
import {
  ArrowRight, BrainCircuit, Check, Download, KeyRound, Loader2,
  Lock, ShieldCheck, Sparkles, TriangleAlert, Wand2, X, Timer, Gauge, Sigma, Activity,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SectionHeading } from "@/components/SectionHeading";
import { ImageDrop } from "@/components/ImageDrop";
import { ThinkingConsole } from "@/components/ThinkingConsole";
import { downloadBase64Png, downloadJson, fetchSampleImage, type EncryptResponse } from "@/lib/api";
import { encryptStream, StreamError, type StreamEvent } from "@/lib/stream";
import { useAuth } from "@/lib/auth";
import { saveHistoryRecord } from "@/lib/history";
import { cn } from "@/lib/utils";

function Stage({ title, src, note }: { title: string; src: string; note?: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-stone-800/80 bg-coal-900/50 p-3 text-center">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      {src ? (
        <img src={src} alt={title} className="mx-auto aspect-square w-full max-w-[180px] rounded-lg border border-stone-800 bg-coal-950 object-cover" />
      ) : (
        <div className="mx-auto flex aspect-square w-full max-w-[180px] animate-pulse items-center justify-center rounded-lg border border-stone-800 bg-coal-950 text-[10px] text-stone-700">
          awaiting…
        </div>
      )}
      {note && <p className="mt-2 font-mono text-[10px] text-stone-500">{note}</p>}
    </div>
  );
}

function StageArrow() {
  return <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-gold-500 md:block" />;
}

interface BigMetric {
  name: string;
  icon: typeof Gauge;
  value: string;
  sub: string;
  pass: boolean;
}

function BigMetricCard({ m }: { m: BigMetric }) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 transition-colors",
      m.pass ? "border-stone-800/80 bg-coal-900/50" : "border-gold-700/40 bg-gold-950/30",
    )}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-stone-500">
          <m.icon className="h-3.5 w-3.5 text-gold-500/70" />
          {m.name}
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            m.pass ? "bg-gold-400/15 text-gold-300" : "bg-amber-400/15 text-amber-300",
          )}
        >
          {m.pass ? <Check className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
          {m.pass ? "PASS" : "CHECK"}
        </span>
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-gold-gradient">{m.value}</p>
      <p className="mt-0.5 text-[11px] text-stone-500">{m.sub}</p>
    </div>
  );
}

function Histogram({ title, data, color }: { title: string; data: { v: number; n: number }[]; color: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-stone-800/80 bg-coal-900/50 p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="v" hide />
          <YAxis hide domain={[0, "dataMax"]} />
          <Area type="monotone" dataKey="n" stroke={color} fill={color} fillOpacity={0.22} strokeWidth={1.2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function EncryptPage() {
  const { username, authFetch } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [rounds, setRounds] = useState(3);
  const [seed, setSeed] = useState(0.45);
  const [r, setR] = useState(3.99);
  const [aes, setAes] = useState(false);
  const [password, setPassword] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [stages, setStages] = useState<{ permuted?: string; cipher?: string }>({});
  const [result, setResult] = useState<EncryptResponse | null>(null);

  const pickFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    setEvents([]);
    setStages({});
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const useSample = async () => {
    setError(null);
    try {
      const blob = await fetchSampleImage();
      pickFile(new File([blob], "sample-benchmark.png", { type: "image/png" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample image failed to load");
    }
  };

  const saveHistory = async (res: EncryptResponse) => {
    if (!username) return;
    try {
      // files land in History/Cipher and History/Key automatically
      saveHistoryRecord(authFetch, {
        type: "encrypt",
        summary: `${file?.name} · ${res.keyFile.width}×${res.keyFile.height} · k=${res.keyFile.rounds} x₀=${res.keyFile.seed}${res.keyFile.aes.enabled ? " · AES" : ""}`,
        detail: {
          rounds: res.keyFile.rounds, seed: res.keyFile.seed, r: res.keyFile.r,
          aes: res.keyFile.aes.enabled, width: res.keyFile.width, height: res.keyFile.height,
        },
        keyFile: res.keyFile as unknown as Record<string, unknown>,
        cipherImage: res.cipherPng,
      });
    } catch {
      // history is best-effort
    }
  };

  const run = async () => {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setEvents([]);
    setStages({});
    try {
      await encryptStream(
        file,
        { mode, rounds, seed, r, aes, password, filename: file.name },
        (e) => {
          setEvents((prev) => [...prev, e]);
          if (e.type === "stage") {
            setStages((s) => ({ ...s, [e.name === "cipher-stages" ? "cipher" : e.name]: e.image }));
          }
          if (e.type === "done") {
            const payload = e.payload as unknown as EncryptResponse;
            setResult(payload);
            void saveHistory(payload);
          }
        },
      );
    } catch (e) {
      setError(e instanceof StreamError ? e.message : "Encryption failed");
    } finally {
      setRunning(false);
    }
  };

  const histData = useMemo(() => {
    if (!result) return { plain: [], cipher: [] };
    return {
      plain: result.metrics.histPlain.map((n, v) => ({ v, n })),
      cipher: result.metrics.histCipher.map((n, v) => ({ v, n })),
    };
  }, [result]);

  const psnrDisplay = result?.metrics.psnrSelf === "Infinity" || result?.metrics.psnrSelf === Infinity
    ? "∞ dB"
    : `${result?.metrics.psnrSelf ?? 0} dB`;
  const psnrLossless = result?.metrics.psnrSelf === "Infinity" || result?.metrics.psnrSelf === Infinity;

  const bigMetrics: BigMetric[] = result
    ? [
        {
          name: "PSNR",
          icon: Sigma,
          value: psnrDisplay,
          sub: "self round-trip · lossless = ∞",
          pass: psnrLossless,
        },
        {
          name: "NPCR",
          icon: Activity,
          value: `${result.metrics.npcr.toFixed(2)}%`,
          sub: "ideal 99.6094%",
          pass: result.metrics.npcr >= 99.0,
        },
        {
          name: "UACI",
          icon: Gauge,
          value: `${result.metrics.uaci.toFixed(2)}%`,
          sub: "ideal 33.4635%",
          pass: Math.abs(result.metrics.uaci - result.metrics.uaciIdeal) < 1,
        },
        {
          name: "Exec time",
          icon: Timer,
          value: `${result.timingMs} ms`,
          sub: `${result.keyFile.width}×${result.keyFile.height} · k=${result.keyFile.rounds}`,
          pass: true,
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        eyebrow="Workspace · sender"
        title="Encrypt an image"
        sub="The pipeline narrates every decision as it runs — parameter selection, key derivation, confusion, diffusion, and the final security metrics."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit rounded-2xl border-stone-800/80 bg-coal-900/40">
          <CardHeader className="border-b border-stone-800/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-[15px] text-stone-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold-500/25 bg-gold-500/10">
                <Lock className="h-3.5 w-3.5 text-gold-400" />
              </span>
              Sender — encrypt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <ImageDrop label="Drop a PNG or JPEG" hint="Colour, up to 2048 px per side — full resolution, lossless" file={file} previewUrl={preview} onFile={pickFile} />
            <Button variant="outline" size="sm" className="w-full rounded-lg border-stone-700 bg-transparent text-stone-300 transition-colors hover:border-gold-500/40 hover:bg-coal-800 hover:text-gold-200" onClick={useSample}>
              <Wand2 className="mr-1.5 h-3.5 w-3.5 text-gold-500/80" /> Use the benchmark sample image
            </Button>

            <Separator className="bg-stone-800/70" />

            <div className="grid grid-cols-2 gap-1 rounded-xl border border-stone-800 bg-coal-950 p-1">
              {(["auto", "manual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                    mode === m ? "bg-gold-400/15 text-gold-300 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.3)]" : "text-stone-500 hover:text-stone-300",
                  )}
                >
                  {m === "auto" ? <BrainCircuit className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                  {m === "auto" ? "AI auto-select" : "Manual"}
                </button>
              ))}
            </div>

            {mode === "manual" && (
              <div className="space-y-4 rounded-xl border border-stone-800 bg-coal-950/70 p-4">
                {[
                  { label: "Permutation rounds (k)", value: rounds, display: String(rounds), min: 1, max: 16, step: 1, set: (v: number) => setRounds(v) },
                  { label: "Chaotic seed (x₀)", value: seed * 100, display: seed.toFixed(2), min: 1, max: 99, step: 1, set: (v: number) => setSeed(v / 100) },
                  { label: "Logistic parameter (r)", value: r * 100, display: r.toFixed(2), min: 357, max: 400, step: 1, set: (v: number) => setR(v / 100) },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <Label className="text-stone-400">{s.label}</Label>
                      <span className="rounded bg-gold-500/10 px-1.5 font-mono tabular-nums text-gold-300">{s.display}</span>
                    </div>
                    <Slider value={[s.value]} onValueChange={([v]) => s.set(v)} min={s.min} max={s.max} step={s.step} />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <Label htmlFor="aes" className="text-xs text-stone-400">AES-256 second layer</Label>
                  <Switch id="aes" checked={aes} onCheckedChange={setAes} />
                </div>
                {aes && (
                  <Input
                    type="password"
                    placeholder="Password (blank = auto-generated into key file)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-lg border-stone-700 bg-coal-900 text-xs text-stone-200 placeholder:text-stone-600"
                  />
                )}
              </div>
            )}

            {mode === "auto" && (
              <p className="rounded-xl border border-gold-500/20 bg-gold-500/5 p-3.5 text-xs leading-relaxed text-gold-200/80">
                <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                The decision tree reads entropy, edge density and size from your image and
                chooses the rounds, chaotic seed and AES flag for this image alone.
              </p>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            <button
              className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 via-gold-400 to-gold-500 text-sm font-semibold text-coal-950 shadow-gold transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
              disabled={!file || running}
              onClick={run}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              {running ? "Thinking…" : "Encrypt image"}
            </button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {events.length === 0 && !running && (
            <div className="bg-noise flex h-full min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-800 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/5">
                <ShieldCheck className="h-7 w-7 text-gold-500/50" />
              </span>
              <p className="text-sm text-stone-500">
                Upload an image and watch the full reasoning trace —
                <br />every phase explains itself while it runs.
              </p>
            </div>
          )}

          {(events.length > 0 || running) && (
            <ThinkingConsole events={events} running={running} title="Encryption pipeline — live reasoning" />
          )}

          {(events.length > 0 || result) && (
            <div className="flex flex-col gap-3 md:flex-row md:gap-2">
              <Stage title="Original" src={preview ?? result?.stages.preprocessed ?? ""} />
              <StageArrow />
              <Stage title="Loaded" src={result?.stages.preprocessed ?? ""} note={result ? `${result.keyFile.width} × ${result.keyFile.height} RGB — nothing discarded` : undefined} />
              <StageArrow />
              <Stage title="Scrambled" src={stages.permuted ?? result?.stages.permuted ?? ""} note={result ? `confusion × ${result.keyFile.rounds} rounds` : undefined} />
              <StageArrow />
              <Stage title="Encrypted" src={stages.cipher ?? result?.stages.cipher ?? ""} note={result?.keyFile.aes.enabled ? "chaotic + AES-256" : "chaotic cipher"} />
            </div>
          )}

          {result && (
            <>
              <div>
                <div className="mb-4 flex items-baseline justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
                    Performance evaluation
                  </p>
                  <p className="font-mono text-xs tabular-nums text-stone-500">
                    completed in <span className="text-gold-300">{result.timingMs} ms</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {bigMetrics.map((m) => <BigMetricCard key={m.name} m={m} />)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-stone-800/80 bg-coal-900/50 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-stone-500">Entropy</p>
                    <p className="mt-2 font-mono text-xl font-bold tabular-nums text-stone-50">
                      <span className="mr-1 text-sm font-normal text-stone-600 line-through">{result.metrics.entropyPlain.toFixed(3)}</span>
                      {result.metrics.entropyCipher.toFixed(4)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-500">ideal 8.0000 · {result.metrics.entropyCipher >= 7.9 ? "PASS" : "CHECK"}</p>
                  </div>
                  <div className="rounded-2xl border border-stone-800/80 bg-coal-900/50 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-stone-500">Adjacent correlation</p>
                    <p className="mt-2 font-mono text-xl font-bold tabular-nums text-stone-50">
                      <span className="mr-1 text-sm font-normal text-stone-600 line-through">{result.metrics.corrPlain.toFixed(3)}</span>
                      {result.metrics.corrCipher.toFixed(4)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-500">ideal 0.0000 · {Math.abs(result.metrics.corrCipher) < 0.05 ? "PASS" : "CHECK"}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row">
                <Histogram title="Histogram — original" data={histData.plain} color="#78716c" />
                <Histogram title="Histogram — encrypted (flat = no information)" data={histData.cipher} color="#d4af37" />
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-gold-500/25 bg-gold-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-stone-400">
                  Send the cipher image together with its key file — the receiver needs both.
                  {result.keyFile.aes.password && (
                    <span className="mt-1.5 block rounded-lg bg-coal-950/70 p-2 font-mono text-[11px] text-gold-300">
                      Auto-generated AES password (stored in key file): {result.keyFile.aes.password}
                    </span>
                  )}
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg border-stone-700 bg-transparent text-stone-200 transition-colors hover:border-gold-500/40 hover:bg-coal-800"
                    onClick={() => downloadBase64Png(result.cipherPng, "cipher.png")}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> cipher.png
                  </Button>
                  <button
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-b from-gold-300 to-gold-500 px-3.5 text-xs font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110"
                    onClick={() => downloadJson(result.keyFile, "chaoticshield.key.json")}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> key file
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
