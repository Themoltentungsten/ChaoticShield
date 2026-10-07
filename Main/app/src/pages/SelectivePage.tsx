// ─────────────────────────────────────────────────────────────────────────────
// SelectivePage — AI-based selective/partial image encryption workflow.
// Upload → Scan → Review → Encrypt → Download
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from "react";
import {
  Download, Eye, KeyRound, Loader2, Lock, ScanEye,
  ShieldCheck, Upload, X, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/SectionHeading";
import { ImageDrop } from "@/components/ImageDrop";
import { RegionCanvas } from "@/components/selective/RegionCanvas";
import { DetectionPanel } from "@/components/selective/DetectionPanel";
import {
  genRegionId,
  PII_LABELS,
  type DetectedRegion,
  type DetectionProgress,
} from "@/lib/ocr/detector";
import { downloadBase64Png, downloadJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { saveHistoryRecord } from "@/lib/history";
import { cn } from "@/lib/utils";

type Step = "upload" | "scanning" | "review" | "encrypting" | "done";

export default function SelectivePage() {
  const { username, authFetch } = useAuth();
  // ── state ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<DetectedRegion[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [scanProgress, setScanProgress] = useState<DetectionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encryptedPng, setEncryptedPng] = useState<string | null>(null);
  const [keyFile, setKeyFile] = useState<object | null>(null);
  const [encrypting, setEncrypting] = useState(false);

  // ── file pick ──────────────────────────────────────────────────────────────
  const pickFile = useCallback((f: File) => {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setRegions([]);
    setEncryptedPng(null);
    setKeyFile(null);
    setError(null);
    setStep("upload");
  }, []);

  // ── scan (Gemini Vision API) ─────────────────────────────────────────
  const startScan = useCallback(async () => {
    if (!file) return;
    setStep("scanning");
    setError(null);
    setScanProgress({ stage: "loading", message: "Sending image to Gemini AI…", progress: 0.1 });

    try {
      setScanProgress({ stage: "recognizing", message: "AI is analyzing the image…", progress: 0.3 });

      const form = new FormData();
      form.append("image", file);

      const res = await fetch("/api/selective/detect", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Detection failed");

      setScanProgress({ stage: "classifying", message: `Found ${data.regions.length} sensitive regions`, progress: 0.9 });

      // Convert server response to DetectedRegion format
      const detected: DetectedRegion[] = data.regions.map((r: any) => ({
        id: genRegionId(),
        type: r.type,
        label: r.label,
        text: r.text || "",
        confidence: r.confidence,
        confidenceLevel: r.confidence >= 0.85 ? "high" : r.confidence >= 0.6 ? "medium" : "low",
        source: "Gemini" as const,
        bbox: r.bbox,
        selected: r.confidence >= 0.6,
      }));

      setRegions(detected);
      setStep("review");
      setScanProgress({ stage: "done", message: `Found ${detected.length} sensitive regions.`, progress: 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
      setStep("upload");
    }
  }, [file]);

  // ── region actions ─────────────────────────────────────────────────────────
  const toggleRegion = useCallback((id: string) => {
    setRegions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
    );
  }, []);

  const deleteRegion = useCallback((id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const selectAll = useCallback(() => {
    setRegions((prev) => prev.map((r) => ({ ...r, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setRegions((prev) => prev.map((r) => ({ ...r, selected: false })));
  }, []);

  const addManualRegion = useCallback((bbox: { x: number; y: number; width: number; height: number }) => {
    setRegions((prev) => [
      ...prev,
      {
        id: genRegionId(),
        type: "CUSTOM",
        label: PII_LABELS.CUSTOM,
        text: "",
        confidence: 1,
        confidenceLevel: "high",
        source: "Manual",
        bbox,
        selected: true,
      },
    ]);
    setDrawMode(false);
  }, []);

  // ── encrypt ────────────────────────────────────────────────────────────────
  const encrypt = useCallback(async () => {
    if (!file) return;
    const selected = regions.filter((r) => r.selected);
    if (selected.length === 0) {
      setError("Select at least one region to encrypt.");
      return;
    }
    if (!password) {
      setError("Enter a password for encryption.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setEncrypting(true);
    setError(null);
    setStep("encrypting");

    try {
      const form = new FormData();
      form.append("image", file);
      form.append("password", password);
      form.append(
        "regions",
        JSON.stringify(
          selected.map((r) => ({
            x: r.bbox.x,
            y: r.bbox.y,
            width: r.bbox.width,
            height: r.bbox.height,
            label: r.type,
          })),
        ),
      );

      const res = await fetch("/api/selective/encrypt", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Encryption failed");

      setEncryptedPng(data.encryptedPng);
      setKeyFile(data.keyFile);
      setStep("done");
      if (username) {
        // files land in History/Cipher and History/Key automatically
        saveHistoryRecord(authFetch, {
          type: "encrypt",
          summary: `${file.name} · selective · ${selected.length} region${selected.length !== 1 ? "s" : ""}`,
          detail: {
            scheme: data.keyFile.scheme,
            width: data.keyFile.width,
            height: data.keyFile.height,
            channels: data.keyFile.channels,
            regions: selected.length,
            kdf: data.keyFile.kdf,
          },
          keyFile: data.keyFile,
          cipherImage: data.encryptedPng,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Encryption failed");
      setStep("review");
    } finally {
      setEncrypting(false);
    }
  }, [file, regions, password, confirmPassword, username, authFetch]);

  // ── reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPreviewUrl(null);
    setRegions([]);
    setEncryptedPng(null);
    setKeyFile(null);
    setPassword("");
    setConfirmPassword("");
    setError(null);
  }, []);

  const selectedCount = regions.filter((r) => r.selected).length;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl">
      <SectionHeading
        eyebrow="Selective Encrypt"
        title="AI-powered partial encryption"
        sub="Upload a document image — the AI scans for sensitive data (phone numbers, emails, Aadhaar, PAN, etc.) and lets you encrypt only those regions, leaving the rest untouched."
      />

      {/* Error banner */}
      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="flex-1 text-sm text-red-300">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Step: Upload ──────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="mt-10 mx-auto max-w-xl">
          <ImageDrop
            label="Drop a document or image"
            hint="PNG or JPEG, up to 25 MB."
            file={file}
            previewUrl={previewUrl}
            onFile={pickFile}
          />
          {file && (
            <div className="mt-6 flex justify-center">
              <Button
                onClick={startScan}
                className="gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-8 py-3 text-sm font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110"
              >
                <ScanEye className="h-4 w-4" />
                Scan for Sensitive Data
              </Button>
            </div>
          )}
          <p className="mt-4 text-center text-[11px] text-stone-600">
            🔒 The scan runs through this app's server — the image is sent only to the configured AI provider.
          </p>
        </div>
      )}

      {/* ── Step: Scanning ────────────────────────────────────────────────── */}
      {step === "scanning" && scanProgress && (
        <div className="mt-16 flex flex-col items-center gap-4">
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-stone-800 border-t-gold-400" />
            <ScanEye className="absolute inset-0 m-auto h-6 w-6 text-gold-400" />
          </div>
          <p className="text-sm font-medium text-stone-300">{scanProgress.message}</p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-stone-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-300"
              style={{ width: `${Math.round(scanProgress.progress * 100)}%` }}
            />
          </div>
          <p className="text-[10px] uppercase tracking-wider text-stone-600">
            {scanProgress.stage}
          </p>
        </div>
      )}

      {/* ── Step: Review ──────────────────────────────────────────────────── */}
      {(step === "review" || step === "encrypting") && previewUrl && (
        <div className="mt-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            {/* Canvas */}
            <div className="h-[500px] lg:h-[600px]">
              <RegionCanvas
                imageSrc={previewUrl}
                regions={regions}
                highlightedId={highlightedId}
                drawMode={drawMode}
                onRegionClick={toggleRegion}
                onDrawComplete={addManualRegion}
              />
            </div>

            {/* Side panel */}
            <div className="flex flex-col gap-4">
              <div className="h-[300px] lg:h-[360px]">
                <DetectionPanel
                  regions={regions}
                  highlightedId={highlightedId}
                  drawMode={drawMode}
                  onToggle={toggleRegion}
                  onDelete={deleteRegion}
                  onHighlight={setHighlightedId}
                  onSelectAll={selectAll}
                  onDeselectAll={deselectAll}
                  onToggleDraw={() => setDrawMode((d) => !d)}
                />
              </div>

              {/* Password + encrypt */}
              <div className="rounded-2xl border border-stone-800/80 bg-coal-900/60 p-4">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
                  <KeyRound className="h-3.5 w-3.5 text-gold-400" />
                  Encryption Password
                </h4>
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-3 border-stone-700 bg-coal-950/60 text-sm"
                />
                <Input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-2 border-stone-700 bg-coal-950/60 text-sm"
                />
                {password && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-800">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          password.length >= 12 ? "w-full bg-emerald-400" :
                          password.length >= 8 ? "w-2/3 bg-amber-400" :
                          "w-1/3 bg-red-400",
                        )}
                      />
                    </div>
                    <span className="text-[10px] text-stone-500">
                      {password.length >= 12 ? "Strong" : password.length >= 8 ? "Medium" : "Weak"}
                    </span>
                  </div>
                )}

                <Button
                  onClick={encrypt}
                  disabled={encrypting || selectedCount === 0 || !password || password !== confirmPassword}
                  className="mt-4 w-full gap-2 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 py-2.5 text-sm font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {encrypting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Encrypt {selectedCount} Region{selectedCount !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </div>

          {/* Re-scan button */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={startScan}
              className="flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-gold-300"
            >
              <ScanEye className="h-3.5 w-3.5" /> Re-scan
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-stone-300"
            >
              <Upload className="h-3.5 w-3.5" /> New image
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Done ────────────────────────────────────────────────────── */}
      {step === "done" && encryptedPng && (
        <div className="mt-10">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
              <span className="text-lg font-semibold">Encryption Complete</span>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Original */}
              <div className="rounded-2xl border border-stone-800/80 bg-coal-900/50 p-4 text-center">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Original</p>
                {previewUrl && (
                  <img src={previewUrl} alt="Original" className="mx-auto max-h-64 rounded-lg border border-stone-800 object-contain" />
                )}
              </div>
              {/* Encrypted */}
              <div className="rounded-2xl border border-stone-800/80 bg-coal-900/50 p-4 text-center">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Encrypted</p>
                <img src={encryptedPng} alt="Encrypted" className="mx-auto max-h-64 rounded-lg border border-stone-800 object-contain" />
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => downloadBase64Png(encryptedPng!, "encrypted-selective.png")}
                className="gap-2 rounded-full border border-gold-500/40 bg-coal-950/60 px-6 py-2.5 text-sm font-semibold text-gold-300 transition-colors hover:border-gold-400 hover:bg-coal-900"
              >
                <Download className="h-4 w-4" /> Download Encrypted Image
              </Button>
              {keyFile && (
                <Button
                  onClick={() => downloadJson(keyFile, "selective-key.json")}
                  className="gap-2 rounded-full border border-gold-500/40 bg-coal-950/60 px-6 py-2.5 text-sm font-semibold text-gold-300 transition-colors hover:border-gold-400 hover:bg-coal-900"
                >
                  <KeyRound className="h-4 w-4" /> Download Key File
                </Button>
              )}
              <Button
                onClick={reset}
                className="gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-6 py-2.5 text-sm font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110"
              >
                <Eye className="h-4 w-4" /> Encrypt Another
              </Button>
            </div>

            <p className="max-w-md text-center text-[11px] leading-relaxed text-stone-600">
              Keep the key file safe — you'll need it along with your password to decrypt the
              encrypted regions later (the Decrypt workspace accepts selective keys). When signed
              in, both are archived in your History automatically. The key file does{" "}
              <strong>not</strong> contain your password.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
