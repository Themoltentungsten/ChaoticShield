import { useNavigate } from "react-router";
import { ArrowRight, Lock, LockOpen, ScrollText } from "lucide-react";
import DriftWall from "@/components/react-bits/DriftWall/DriftWall";

const TILES = Array.from({ length: 12 }, (_, i) => ({
  image: `/tiles/tile-${String(i).padStart(2, "0")}.png`,
  title: `Sample ${i + 1}`,
}));

const BENCH = [
  { label: "Information entropy", value: "7.9973", sub: "of 8.0000 ideal" },
  { label: "NPCR", value: "99.62%", sub: "ideal 99.6094%" },
  { label: "UACI", value: "33.60%", sub: "ideal 33.4635%" },
  { label: "Pixel correlation", value: "−0.0139", sub: "from +0.9393" },
];

export default function HomePage() {
  const nav = useNavigate();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="relative -mx-4 -mt-24 overflow-hidden">
        <div className="absolute inset-0">
          <DriftWall
            items={TILES}
            columns={5}
            speed={25}
            dim={0.3}
            fade={0.7}
            grayscale={false}
            overlayColor="#0b0906"
            pauseOnHover
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-coal-950/80 via-coal-950/70 to-coal-950" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-32 text-center">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-gold-500/25 bg-gold-500/5 py-1.5 pl-2 pr-4 backdrop-blur-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-400/15">
                <Lock className="h-3 w-3 text-gold-400" />
              </span>
              <span className="text-xs font-medium tracking-wide text-gold-300/90">
                Hybrid chaotic encryption · AI parameter selection
              </span>
            </span>
          </div>

          <h1 className="mx-auto mt-7 max-w-4xl animate-fade-up font-display text-[42px] font-bold leading-[1.08] tracking-tight text-stone-50 [animation-delay:120ms] sm:text-6xl">
            Encrypt images so completely, they look like{" "}
            <span className="text-gold-gradient">pure noise</span>.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-[16px] leading-relaxed text-stone-400 [animation-delay:240ms] sm:text-lg">
            The Arnold Cat Map shuffles every pixel position, a Logistic-Map keystream
            rewrites every pixel value, and a decision tree chooses the parameters for
            each individual image. Watch the entire pipeline reason in real time.
          </p>

          <div className="mt-10 flex animate-fade-up flex-wrap items-center justify-center gap-4 [animation-delay:360ms]">
            <button
              onClick={() => nav("/encrypt")}
              className="group flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-gold-300 via-gold-400 to-gold-500 px-7 text-[15px] font-semibold text-coal-950 shadow-gold transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-10px_rgba(212,175,55,0.5)]"
            >
              Encrypt an image
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => nav("/decrypt")}
              className="group flex h-12 items-center gap-2 rounded-full border border-stone-700/70 bg-coal-950/50 px-6 text-[15px] font-medium text-stone-200 backdrop-blur transition-colors hover:border-gold-500/50 hover:text-gold-300"
            >
              <LockOpen className="h-4 w-4 text-gold-500/80" />
              Decrypt a cipher
            </button>
            <button
              onClick={() => nav("/methodology")}
              className="group flex h-12 items-center gap-2 rounded-full border border-stone-700/70 bg-coal-950/50 px-6 text-[15px] font-medium text-stone-200 backdrop-blur transition-colors hover:border-gold-500/50 hover:text-gold-300"
            >
              <ScrollText className="h-4 w-4 text-gold-500/80" />
              How it works
            </button>
          </div>

          <div className="mx-auto mt-14 max-w-4xl animate-fade-up [animation-delay:480ms]">
            <div className="border-gold-gradient rounded-2xl p-px">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-gold-500/20 sm:grid-cols-4">
                {BENCH.map((b) => (
                  <div key={b.label} className="bg-coal-950/95 p-5 text-left backdrop-blur">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                      {b.label}
                    </p>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-gold-gradient">
                      {b.value}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-500">{b.sub}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-stone-600">
              Benchmark figures measured on the 256×256 grayscale reference image in the project report.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
