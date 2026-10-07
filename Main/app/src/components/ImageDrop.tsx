import { useCallback, useRef, useState } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  hint?: string;
  accept?: string;
  file: File | null;
  previewUrl?: string | null;
  onFile: (file: File) => void;
  compact?: boolean;
}

export function ImageDrop({ label, hint, accept = "image/png,image/jpeg", file, previewUrl, onFile, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200",
        dragging
          ? "border-gold-400 bg-gold-400/10 shadow-gold-sm"
          : "border-stone-700/80 bg-coal-950/50 hover:border-gold-500/50 hover:bg-coal-900",
        compact ? "min-h-[120px] p-3" : "min-h-[220px] p-6",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      {previewUrl ? (
        <>
          <img
            src={previewUrl}
            alt={label}
            className={cn("rounded-lg object-contain", compact ? "max-h-28" : "max-h-52")}
          />
          <div className="mt-2 flex items-center gap-1.5 text-xs text-stone-400 group-hover:text-stone-200">
            <RefreshCw className="h-3 w-3 text-gold-500/70" />
            {file?.name ?? label} — click to replace
          </div>
        </>
      ) : (
        <>
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/8 transition-colors group-hover:bg-gold-500/15">
            <ImagePlus className="h-5 w-5 text-gold-500/80 transition-colors group-hover:text-gold-300" />
          </span>
          <p className="text-sm font-medium text-stone-300">{label}</p>
          {hint && <p className="mt-1 max-w-[240px] text-center text-xs leading-relaxed text-stone-500">{hint}</p>}
        </>
      )}
    </div>
  );
}
