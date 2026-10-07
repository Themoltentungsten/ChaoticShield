import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit, Sparkles, Check, X, Ruler, Timer, Loader2, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/stream";

function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(text.length, i + 3);
      setN(i);
      if (i >= text.length) {
        window.clearInterval(id);
        onDone?.();
      }
    }, 14);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      {n < text.length && <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-gold-400" />}
    </span>
  );
}

function MetricRow({ e }: { e: Extract<StreamEvent, { type: "metric" }> }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-800/80 bg-coal-950/80 px-3 py-2 font-mono text-[11px]">
      {e.pass ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-gold-400" />
      ) : (
        <X className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      )}
      <span className="w-24 shrink-0 uppercase tracking-wide text-stone-400">{e.name}</span>
      {typeof e.before === "number" && (
        <span className="text-stone-600 line-through">{e.before.toFixed(3)}</span>
      )}
      <span className="font-semibold text-gold-300">
        {typeof e.value === "number" ? e.value.toFixed(4) : e.value}
        {e.unit ?? ""}
      </span>
      <span className="text-stone-600">ideal {e.ideal}</span>
    </div>
  );
}

export function ThinkingConsole({
  events,
  running,
  title = "Working through the pipeline",
  className,
}: {
  events: StreamEvent[];
  running: boolean;
  title?: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastThought = events.filter((e) => e.type === "thought").length;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  const lastTiming = [...events].reverse().find((e) => e.type === "timing") as
    | Extract<StreamEvent, { type: "timing" }>
    | undefined;

  if (events.length === 0 && !running) return null;

  let thoughtSeen = 0;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-gold-500/20 bg-coal-950/90", className)}>
      <div className="flex items-center gap-2.5 border-b border-stone-800/70 bg-coal-900/60 px-4 py-2.5">
        <BrainCircuit className={cn("h-4 w-4 text-gold-400", running && "animate-pulse")} />
        <p className="text-xs font-semibold tracking-wide text-stone-200">{title}</p>
        {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-gold-500/70" />}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-stone-600">
          {lastTiming ? `t = ${lastTiming.ms} ms` : ""}
        </span>
      </div>

      <div ref={scrollRef} className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto p-4">
        {events.map((e, i) => {
          switch (e.type) {
            case "phase":
              return (
                <div key={i} className="mt-2 flex items-center gap-2 first:mt-0">
                  <ChevronRight className="h-3.5 w-3.5 text-gold-500" />
                  <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-gold-300">
                    {e.label}
                  </p>
                  <span className="h-px flex-1 gold-ring-divider opacity-40" />
                </div>
              );
            case "thought":
              thoughtSeen++;
              return (
                <div key={i} className="flex gap-2.5 py-1 pl-1">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500/70" />
                  <p className="text-[13px] leading-relaxed text-stone-300">
                    {thoughtSeen === lastThought && running ? <Typed text={e.text} /> : e.text}
                  </p>
                </div>
              );
            case "fact":
              return (
                <p key={i} className="my-0.5 ml-6 rounded-lg border border-stone-800/80 bg-coal-900/70 px-3 py-1.5 font-mono text-[11px] leading-relaxed text-stone-400">
                  <Ruler className="mr-1.5 inline h-3 w-3 text-gold-500/60" />
                  {e.text}
                </p>
              );
            case "trace":
              return (
                <p key={i} className="ml-6 flex items-center gap-1.5 py-0.5 font-mono text-[11px] text-stone-500">
                  {e.passed ? (
                    <Check className="h-3 w-3 shrink-0 text-gold-400" />
                  ) : (
                    <X className="h-3 w-3 shrink-0 text-stone-700" />
                  )}
                  {e.text}
                </p>
              );
            case "decision":
              return (
                <div key={i} className="ml-6 mt-1 rounded-xl border border-gold-500/25 bg-gold-500/8 p-3">
                  <p className="text-xs font-semibold text-gold-300">{e.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-stone-400">{e.reason}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-gold-200/80">
                    rounds = {e.rounds} · x₀ = {e.seed} · r = {e.r} · AES = {e.aes ? "on" : "off"}
                  </p>
                </div>
              );
            case "metric":
              return (
                <div key={i} className="ml-6">
                  <MetricRow e={e} />
                </div>
              );
            case "timing":
              return (
                <p key={i} className="ml-6 flex items-center gap-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                  <Timer className="h-3 w-3" /> {e.phase} complete at t = {e.ms} ms
                </p>
              );
            case "stage":
              return (
                <div key={i} className="ml-6 mt-1 flex items-center gap-2">
                  <img src={e.image} alt={e.name} className="h-16 w-16 rounded-lg border border-gold-500/30 object-cover" />
                  <p className="font-mono text-[11px] text-stone-500">stage captured: {e.name}</p>
                </div>
              );
            default:
              return null;
          }
        })}
        {running && (
          <div className="flex items-center gap-1.5 py-2 pl-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-400 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-400 [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-400 [animation-delay:240ms]" />
          </div>
        )}
      </div>
    </div>
  );
}
