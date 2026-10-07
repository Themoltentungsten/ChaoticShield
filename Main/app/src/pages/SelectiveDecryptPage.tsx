// ─────────────────────────────────────────────────────────────────────────────
// SelectiveDecryptPage — decrypt selectively encrypted images.
// Upload encrypted image + key file + password → restore original pixels.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from "react";
import {
  AlertTriangle, Download, KeyRound, Loader2, LockOpen, ShieldCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/SectionHeading";
import { ImageDrop } from "@/components/ImageDrop";
import { downloadBase64Png, isSelectiveKey, type SelectiveKeyFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { saveHistoryRecord } from "@/lib/history";

export default function SelectiveDecryptPage() {
  const { username, authFetch } = useAuth();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [keyMeta, setKeyMeta] = useState<SelectiveKeyFile | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [decrypting, setDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decryptedPng, setDecryptedPng] = useState<string | null>(null);
  const [regionsCount, setRegionsCount] = useState(0);

  const pickImage = useCallback((f: File) => {
    setImageFile(f);
    setDecryptedPng(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  const pickKey = useCallback((f: File) => {
    setKeyFile(f);
    setDecryptedPng(null);
    setError(null);
    setKeyError(null);
    setKeyMeta(null);
    f.text()
      .then((txt) => {
        const parsed = JSON.parse(txt);
        if (!isSelectiveKey(parsed)) throw new Error("not a selective key");
        setKeyMeta(parsed);
      })
      .catch(() => {
        setKeyError("This is not a selective-encryption key file.");
      });
  }, []);

  const decrypt = useCallback(async () => {
    if (!imageFile || !keyFile || !password) return;
    setDecrypting(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("image", imageFile);
      form.append("key", keyFile);
      form.append("password", password);

      const res = await fetch("/api/selective/decrypt", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Decryption failed");

      setDecryptedPng(data.decryptedPng);
      setRegionsCount(data.regionsDecrypted || 0);
      if (username) {
        // files land in History/Cipher, History/Key and History/Recovered
        saveHistoryRecord(authFetch, {
          type: "decrypt",
          summary: `${imageFile.name} · selective · ${data.regionsDecrypted || 0} regions restored`,
          detail: { scheme: "selective-aes-256-gcm", regions: data.regionsDecrypted || 0 },
          keyFile: keyMeta ? (keyMeta as unknown as Record<string, unknown>) : undefined,
          cipherImage: imagePreview ?? undefined,
          recoveredImage: data.decryptedPng,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decryption failed");
    } finally {
      setDecrypting(false);
    }
  }, [imageFile, keyFile, password, username, authFetch, keyMeta, imagePreview]);

  const reset = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    setKeyFile(null);
    setPassword("");
    setDecryptedPng(null);
    setError(null);
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeading
        eyebrow="Selective Decrypt"
        title="Restore encrypted regions"
        sub="Upload the encrypted image, its key file, and the password used during encryption. The original content will be restored."
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

      {!decryptedPng ? (
        <div className="mt-10 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageDrop
              label="Encrypted image"
              hint="The PNG with encrypted regions"
              file={imageFile}
              previewUrl={imagePreview}
              onFile={pickImage}
            />
            <ImageDrop
              label="Key file (.json)"
              hint="The selective-key.json from encryption"
              accept="application/json,.json"
              file={keyFile}
              previewUrl={null}
              onFile={pickKey}
            />
            {keyError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                <X className="h-3.5 w-3.5" /> {keyError}
              </p>
            )}
          </div>

          <div className="mx-auto max-w-xs">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              <KeyRound className="h-3.5 w-3.5 text-gold-400" />
              Password
            </label>
            <Input
              type="password"
              placeholder="Enter decryption password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-stone-700 bg-coal-950/60 text-sm"
            />
          </div>

          <div className="flex justify-center">
            <Button
              onClick={decrypt}
              disabled={decrypting || !imageFile || !keyFile || !!keyError || !password}
              className="gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-8 py-3 text-sm font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110 disabled:opacity-50"
            >
              {decrypting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LockOpen className="h-4 w-4" />
              )}
              Decrypt Regions
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-6">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
            <span className="text-lg font-semibold">
              Decryption Successful — {regionsCount} region{regionsCount !== 1 ? "s" : ""} restored
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Encrypted */}
            <div className="rounded-2xl border border-stone-800/80 bg-coal-900/50 p-4 text-center">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Encrypted</p>
              {imagePreview && (
                <img src={imagePreview} alt="Encrypted" className="mx-auto max-h-64 rounded-lg border border-stone-800 object-contain" />
              )}
            </div>
            {/* Decrypted */}
            <div className="rounded-2xl border border-stone-800/80 bg-coal-900/50 p-4 text-center">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Decrypted</p>
              <img src={decryptedPng} alt="Decrypted" className="mx-auto max-h-64 rounded-lg border border-stone-800 object-contain" />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => downloadBase64Png(decryptedPng!, "decrypted-selective.png")}
              className="gap-2 rounded-full border border-gold-500/40 bg-coal-950/60 px-6 py-2.5 text-sm font-semibold text-gold-300 transition-colors hover:border-gold-400 hover:bg-coal-900"
            >
              <Download className="h-4 w-4" /> Download Decrypted Image
            </Button>
            <Button
              onClick={reset}
              className="gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-6 py-2.5 text-sm font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110"
            >
              Decrypt Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
