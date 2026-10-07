import {
  Image as ImageIcon, Crop, BrainCircuit, KeyRound, Shuffle,
  Binary, LockOpen, BarChart3, ArrowRight,
} from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";

const PHASES = [
  {
    icon: ImageIcon,
    name: "Input Image",
    method: "Read a grayscale or RGB image.",
    example: "Ship image of size 256 × 256.",
    output: "Original image",
  },
  {
    icon: Crop,
    name: "Image Preprocessing",
    method: "Decode the image at native resolution — colour channels are kept, nothing is resized or flattened.",
    example: "RGB channels encrypted jointly at full resolution (report benchmark: 256 × 256 grayscale).",
    output: "Loaded image",
  },
  {
    icon: BrainCircuit,
    name: "Machine Learning Analysis",
    method: "A lightweight model analyzes entropy, texture and edge density, then selects encryption parameters.",
    example: "The model predicts High Texture, so it selects a stronger chaotic configuration.",
    output: "Selected chaotic parameters",
  },
  {
    icon: KeyRound,
    name: "Hybrid Chaotic Key Generation",
    method: "Generate secret keys using two or more chaotic maps.",
    example: "Logistic: x₀ = 0.45, r = 3.99 — combined with a SHA-256 digest of the image itself.",
    output: "Chaotic key sequence",
  },
  {
    icon: Shuffle,
    name: "Pixel Permutation (Confusion)",
    method: "Shuffle pixel positions using the first chaotic sequence — Arnold Cat Map on square grids, a chaotic Fisher–Yates shuffle on rectangular ones.",
    example: "Pixel at (20, 35) moves to (145, 102).",
    output: "Scrambled image",
  },
  {
    icon: Binary,
    name: "Pixel Diffusion",
    method: "Modify pixel values using chained XOR with the chaotic keystream.",
    example: "Pixel 150 XOR key 91 → encrypted pixel 205.",
    output: "Encrypted image",
  },
  {
    icon: LockOpen,
    name: "Decryption",
    method: "Verify the SHA-256 tag, then apply inverse diffusion and inverse permutation with the same keys.",
    example: "XOR with key 91, then 192 − k Arnold rounds.",
    output: "Recovered image",
  },
  {
    icon: BarChart3,
    name: "Performance Evaluation",
    method: "Evaluate with security and image-quality metrics — PSNR, NPCR, UACI, entropy, correlation and execution time.",
    example: "Entropy = 7.998, NPCR = 99.62 %, UACI = 33.41 %, PSNR = ∞, correlation ≈ 0.002.",
    output: "Performance results",
  },
];

// ── working flow: the two chains every run travels through ──────────────────
const ENC_STEPS = [
  "Upload image", "Decode at native RGB", "Feature analysis", "AI parameter selection",
  "Confusion (permute)", "Diffusion (XOR keystream)", "Optional AES-256-GCM",
  "SHA-256 integrity tag", "Self-test + metrics", "Cipher + key file",
];
const DEC_STEPS = [
  "Upload cipher + key", "Parse key file", "Verify SHA-256", "AES unwrap (if enabled)",
  "Inverse diffusion", "Inverse confusion", "Recovered image — bit-exact",
];

// ── API reference: endpoint → role in the flow ──────────────────────────────
const API_GROUPS: { title: string; rows: [method: string, path: string, role: string][] }[] = [
  {
    title: "Core crypto — full image",
    rows: [
      ["POST", "/api/encrypt", "One-shot pipeline: features → decision tree → confusion → diffusion → optional AES → security metrics"],
      ["POST", "/api/encrypt/stream", "Identical pipeline, streamed as SSE events that drive the live “thinking” console"],
      ["POST", "/api/decrypt", "Cipher + key in → SHA-256 verified first → inverse diffusion → inverse confusion → recovered PNG"],
      ["POST", "/api/decrypt/stream", "Same decryption, streamed phase by phase"],
    ],
  },
  {
    title: "Selective (region) encryption",
    rows: [
      ["POST", "/api/selective/detect", "Gemini Vision scans the document and returns PII bounding boxes with confidence scores"],
      ["POST", "/api/selective/encrypt", "Each selected region gets its own AES-256-GCM call under a PBKDF2-SHA-512 key"],
      ["POST", "/api/selective/decrypt", "Every region is authenticated (GCM tag) and restored — tampering aborts the run"],
    ],
  },
  {
    title: "Accounts & history",
    rows: [
      ["POST", "/api/auth/signup · /login · /logout", "scrypt-hashed passwords → random bearer tokens (max 8 per user)"],
      ["GET", "/api/auth/me", "Validates the stored session on page load"],
      ["GET", "/api/history/counts · /api/history/files", "Per-user archive: History/cipher · History/key · History/recovered"],
      ["POST", "/api/history", "Files an encrypt/decrypt run into the archive (PNGs on disk, key JSON inline)"],
    ],
  },
  {
    title: "Utilities",
    rows: [
      ["GET", "/api/health", "Scheme, dimension limit and the Arnold-map period at 256×256"],
      ["GET", "/api/sample", "Procedurally generated colour benchmark image — try the pipeline without uploading"],
      ["GET", "/api", "Live JSON index of every endpoint on this server"],
    ],
  },
];

function FlowChain({ steps, gold }: { steps: string[]; gold?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center">
          <span
            className={
              gold
                ? "rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-[11px] font-medium text-gold-300"
                : "rounded-full border border-stone-700/80 bg-coal-950/60 px-3 py-1.5 text-[11px] font-medium text-stone-300"
            }
          >
            {s}
          </span>
          {i < steps.length - 1 && <ArrowRight className="mx-1 h-3.5 w-3.5 shrink-0 text-gold-500/60" />}
        </span>
      ))}
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        eyebrow="Proposed methodology"
        title="Eight phases, one lossless round-trip"
        sub="Every phase below is implemented live in the workspace — encrypt an image and watch each step explain itself in real time, not just the final cipher."
      />

      <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        <a href="#phases" className="transition-colors hover:text-gold-300">Phases</a>
        <span className="text-stone-700">·</span>
        <a href="#flow" className="transition-colors hover:text-gold-300">Working flow</a>
        <span className="text-stone-700">·</span>
        <a href="#api" className="transition-colors hover:text-gold-300">API reference</a>
      </div>

      <div id="phases" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PHASES.map((p, i) => (
          <div
            key={p.name}
            className="group relative overflow-hidden rounded-2xl border border-stone-800/80 bg-coal-900/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-gold-500/40 hover:bg-coal-900/70 hover:shadow-gold-sm"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/10 text-gold-400 transition-colors group-hover:bg-gold-500/15">
                <p.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="font-display text-2xl font-bold text-stone-800 transition-colors group-hover:text-gold-500/40">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-stone-100">{p.name}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-400">{p.method}</p>
            <p className="mt-3 rounded-lg border border-stone-800/80 bg-coal-950/80 p-2.5 font-mono text-[11px] leading-relaxed text-stone-500">
              {p.example}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold-400/90">
              <span className="h-px w-3 bg-gold-500/60" />
              {p.output}
            </p>
          </div>
        ))}
      </div>

      {/* ── working flow ─────────────────────────────────────────────────── */}
      <section id="flow" className="mt-16">
        <h2 className="font-display text-xl font-bold text-stone-100">Working flow</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-stone-400">
          Every run walks one of these two chains end to end. Encryption ends with a
          cipher PNG plus a JSON key file; decryption refuses to touch any key material
          until the SHA-256 tag of the uploaded cipher matches the one recorded in that file.
        </p>

        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-stone-800/80 bg-coal-900/40 p-5">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gold-400">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
              Encryption — sender side
            </p>
            <FlowChain steps={ENC_STEPS} gold />
          </div>
          <div className="rounded-2xl border border-stone-800/80 bg-coal-900/40 p-5">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              <span className="h-1.5 w-1.5 rounded-full bg-stone-500" />
              Decryption — receiver side
            </p>
            <FlowChain steps={DEC_STEPS} />
          </div>
        </div>
      </section>

      {/* ── API reference ────────────────────────────────────────────────── */}
      <section id="api" className="mt-16">
        <h2 className="font-display text-xl font-bold text-stone-100">API reference</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-stone-400">
          Everything the pages above do goes through one Express server on a single port.
          GET endpoints are live links — open them in a new tab and the server answers
          directly. The full machine-readable index is{" "}
          <a href="/api" target="_blank" rel="noreferrer" className="font-mono text-gold-300 underline decoration-gold-500/40 underline-offset-2 hover:text-gold-200">
            /api
          </a>.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {API_GROUPS.map((g) => (
            <div key={g.title} className="rounded-2xl border border-stone-800/80 bg-coal-900/40 p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gold-400">{g.title}</p>
              <div className="space-y-3">
                {g.rows.map(([method, path, role]) => (
                  <div key={path} className="flex items-start gap-2.5">
                    <span
                      className={
                        method === "GET"
                          ? "mt-0.5 w-12 shrink-0 rounded-md border border-gold-500/30 bg-gold-500/10 py-0.5 text-center font-mono text-[10px] font-bold text-gold-300"
                          : "mt-0.5 w-12 shrink-0 rounded-md border border-stone-700 bg-coal-950/60 py-0.5 text-center font-mono text-[10px] font-bold text-stone-400"
                      }
                    >
                      {method}
                    </span>
                    <div className="min-w-0">
                      {method === "GET" && !path.includes("·") ? (
                        <a
                          href={path}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all font-mono text-[12px] text-stone-200 underline decoration-stone-700 underline-offset-2 transition-colors hover:text-gold-300 hover:decoration-gold-500/50"
                        >
                          {path}
                        </a>
                      ) : (
                        <code className="break-all font-mono text-[12px] text-stone-200">{path}</code>
                      )}
                      <p className="mt-0.5 text-[12px] leading-relaxed text-stone-500">{role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
