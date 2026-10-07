import { Component, Suspense, lazy, type ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";

const Lanyard = lazy(() => import("@/components/react-bits/Lanyard"));

const TEAM = [
  { name: "Yash Kumar Raut", roll: "2301020847", role: "Lead Developer", card: "/idcards/yash.png" },
  { name: "Rishu Mehta", roll: "2301020752", role: "ML & Evaluation", card: "/idcards/rishu.png" },
  { name: "Suman Kumar", roll: "2301020176", role: "Cryptanalysis", card: "/idcards/suman.png" },
];

function LanyardFallback() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-700 border-t-gold-400" />
      <p className="text-xs text-stone-500">Loading badge…</p>
    </div>
  );
}

/* Static fallback shown when WebGL context creation fails */
function StaticCardFallback({ image }: { image: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <img
        src={image}
        alt="ID card"
        className="h-auto max-h-[85%] w-auto max-w-[70%] rounded-lg shadow-lg shadow-black/40"
        style={{ objectFit: "contain" }}
      />
      <p className="text-[10px] text-stone-600">3D view unavailable</p>
    </div>
  );
}

/* Error boundary that catches WebGL / Three.js runtime crashes */
interface EBProps { children: ReactNode; fallback: ReactNode }
interface EBState { hasError: boolean }

class LanyardErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): EBState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[TeamPage] 3D badge failed to render:", error.message);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export default function TeamPage() {
  return (
    <div className="mx-auto max-w-[92vw] lg:max-w-[96vw] xl:max-w-[98vw]">
      <SectionHeading
        eyebrow="The team"
        title="Built by three, supervised by one"
        sub={
          <>
            Department of Computer Science and Engineering, C.V. Raman Global University,
            Bhubaneswar — under the supervision of{" "}
            <span className="font-medium text-gold-300">Dr. Sampa Sahoo</span>. Drag a
            badge to swing it.
          </>
        }
      />

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        {TEAM.map((t, i) => (
          <div
            key={t.roll}
            className="group overflow-hidden rounded-2xl border border-stone-800/80 bg-coal-900/40 transition-all duration-300 hover:-translate-y-1 hover:border-gold-500/40 hover:shadow-gold-sm"
          >
            <div className="relative h-[360px] w-full bg-coal-950/60 sm:h-[400px]">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <LanyardErrorBoundary fallback={<StaticCardFallback image={t.card} />}>
                <Suspense fallback={<LanyardFallback />}>
                  <Lanyard
                    position={[0, 0, 13]}
                    gravity={[0, -40, 0]}
                    fov={22}
                    frontImage={t.card}
                    imageFit="cover"
                  />
                </Suspense>
              </LanyardErrorBoundary>
            </div>
            <div className="border-t border-stone-800/80 bg-coal-900/70 p-4 text-center sm:p-5">
              <p className="font-display text-[14px] font-semibold tracking-wide text-stone-100 sm:text-[15px]">
                {t.name}
              </p>
              <p className="mt-1 text-[11px] text-stone-500">
                <span className="text-gold-400">{t.role}</span> · Roll no. {t.roll}
              </p>
              <div className="mx-auto mt-3 h-px w-16 gold-ring-divider" />
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-stone-600">
                <GraduationCap className="h-3 w-3" />
                Member {String(i + 1).padStart(2, "0")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
