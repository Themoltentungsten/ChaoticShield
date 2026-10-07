// ─────────────────────────────────────────────────────────────────────────────
// DetectionPanel — sidebar listing detected PII regions with controls.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Check, CheckCircle2, Circle, MousePointer2, Plus, RotateCcw,
  ShieldAlert, Trash2, Eye,
} from "lucide-react";
import { PII_COLORS, type DetectedRegion } from "@/lib/ocr/detector";
import { cn } from "@/lib/utils";

interface Props {
  regions: DetectedRegion[];
  highlightedId: string | null;
  drawMode: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onHighlight: (id: string | null) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggleDraw: () => void;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.9 ? "bg-emerald-400" : value >= 0.7 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-stone-800">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-stone-500">{pct}%</span>
    </div>
  );
}

export function DetectionPanel({
  regions,
  highlightedId,
  drawMode,
  onToggle,
  onDelete,
  onHighlight,
  onSelectAll,
  onDeselectAll,
  onToggleDraw,
}: Props) {
  const selected = regions.filter((r) => r.selected).length;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-800/80 bg-coal-900/60">
      {/* Header */}
      <div className="border-b border-stone-800/60 px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
          <ShieldAlert className="h-3.5 w-3.5 text-gold-400" />
          Detected Sensitive Info
        </h3>
        <p className="mt-1 text-[11px] text-stone-600">
          {regions.length} region{regions.length !== 1 ? "s" : ""} · {selected} selected
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-1.5 border-b border-stone-800/40 px-3 py-2">
        <button
          onClick={onSelectAll}
          className="flex items-center gap-1 rounded-md bg-stone-800/60 px-2 py-1 text-[10px] text-stone-300 transition-colors hover:bg-stone-700"
        >
          <CheckCircle2 className="h-3 w-3" /> Select All
        </button>
        <button
          onClick={onDeselectAll}
          className="flex items-center gap-1 rounded-md bg-stone-800/60 px-2 py-1 text-[10px] text-stone-300 transition-colors hover:bg-stone-700"
        >
          <Circle className="h-3 w-3" /> Deselect
        </button>
        <button
          onClick={onToggleDraw}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors",
            drawMode
              ? "bg-gold-500/20 text-gold-300 ring-1 ring-gold-500/40"
              : "bg-stone-800/60 text-stone-300 hover:bg-stone-700",
          )}
        >
          {drawMode ? <MousePointer2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {drawMode ? "Drawing…" : "Add Region"}
        </button>
      </div>

      {/* Region list */}
      <div className="flex-1 overflow-y-auto">
        {regions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <Eye className="h-6 w-6 text-stone-700" />
            <p className="text-xs text-stone-600">No regions detected yet</p>
            <p className="text-[10px] text-stone-700">
              Scan the image or add regions manually
            </p>
          </div>
        )}
        {regions.map((r) => (
          <div
            key={r.id}
            onMouseEnter={() => onHighlight(r.id)}
            onMouseLeave={() => onHighlight(null)}
            className={cn(
              "group flex items-start gap-2 border-b border-stone-800/30 px-3 py-2.5 transition-colors",
              highlightedId === r.id && "bg-gold-500/5",
            )}
          >
            {/* Checkbox */}
            <button
              onClick={() => onToggle(r.id)}
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                r.selected
                  ? "border-gold-500 bg-gold-500 text-coal-950"
                  : "border-stone-600 bg-coal-950/60 hover:border-stone-500",
              )}
            >
              {r.selected && <Check className="h-3 w-3" />}
            </button>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: PII_COLORS[r.type] }}
                />
                <span className="text-xs font-medium text-stone-200">{r.label}</span>
                {r.source === "Manual" && (
                  <span className="rounded bg-stone-800 px-1 py-0.5 text-[8px] font-semibold uppercase text-stone-500">
                    Manual
                  </span>
                )}
              </div>
              {r.text && (
                <p className="mt-0.5 truncate font-mono text-[10px] text-stone-500" title={r.text}>
                  {r.text}
                </p>
              )}
              <div className="mt-1">
                <ConfidenceBar value={r.confidence} />
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={() => onDelete(r.id)}
              className="mt-0.5 rounded p-1 text-stone-700 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      {regions.length > 0 && (
        <div className="border-t border-stone-800/60 px-4 py-2">
          <button
            onClick={onDeselectAll}
            className="flex items-center gap-1 text-[10px] text-stone-600 transition-colors hover:text-stone-400"
          >
            <RotateCcw className="h-3 w-3" /> Reset selections
          </button>
        </div>
      )}
    </div>
  );
}
