// ─────────────────────────────────────────────────────────────────────────────
// RegionCanvas — interactive canvas overlay for bounding-box visualization,
// region selection, manual drawing, zoom, and pan.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useEffect, useCallback, useState, type PointerEvent as RPointerEvent } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { PII_COLORS, type DetectedRegion, type RegionBBox } from "@/lib/ocr/detector";

interface Props {
  imageSrc: string;
  regions: DetectedRegion[];
  highlightedId: string | null;
  drawMode: boolean;
  onRegionClick: (id: string) => void;
  onDrawComplete: (bbox: RegionBBox) => void;
}

export function RegionCanvas({
  imageSrc,
  regions,
  highlightedId,
  drawMode,
  onRegionClick,
  onDrawComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [panning, setPanning] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Fit the image inside the container — also the "reset view" action
  const fitToContainer = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const s = Math.min(cw / img.width, ch / img.height, 1);
    setScale(s);
    setOffset({ x: (cw - img.width * s) / 2, y: (ch - img.height * s) / 2 });
  }, []);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
      fitToContainer();
    };
    img.src = imageSrc;
  }, [imageSrc, fitToContainer]);

  // Draw canvas
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cw = containerRef.current?.clientWidth ?? 800;
    const ch = containerRef.current?.clientHeight ?? 600;
    canvas.width = cw;
    canvas.height = ch;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Image
    ctx.drawImage(img, 0, 0);

    // Bounding boxes
    for (const r of regions) {
      const color = PII_COLORS[r.type] || "#d4af37";
      const isHighlighted = r.id === highlightedId;
      const alpha = r.selected ? (isHighlighted ? 0.45 : 0.25) : 0.08;

      // Fill
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fillRect(r.bbox.x, r.bbox.y, r.bbox.width, r.bbox.height);

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = isHighlighted ? 3 / scale : 2 / scale;
      ctx.setLineDash(r.selected ? [] : [6 / scale, 4 / scale]);
      ctx.strokeRect(r.bbox.x, r.bbox.y, r.bbox.width, r.bbox.height);
      ctx.setLineDash([]);

      // Label
      const fontSize = Math.max(10, 12 / scale);
      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
      const label = r.label;
      const tw = ctx.measureText(label).width;
      const lx = r.bbox.x;
      const ly = r.bbox.y - 4 / scale;
      ctx.fillStyle = color;
      ctx.fillRect(lx - 1 / scale, ly - fontSize - 2 / scale, tw + 6 / scale, fontSize + 4 / scale);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, lx + 2 / scale, ly - 2 / scale);
    }

    // Drawing rectangle
    if (drawing) {
      ctx.strokeStyle = "#d4af37";
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      const x = Math.min(drawing.sx, drawing.cx);
      const y = Math.min(drawing.sy, drawing.cy);
      const w = Math.abs(drawing.cx - drawing.sx);
      const h = Math.abs(drawing.cy - drawing.sy);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "rgba(212, 175, 55, 0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [imgLoaded, regions, highlightedId, scale, offset, drawing]);

  useEffect(() => {
    requestAnimationFrame(paint);
  }, [paint]);

  // Convert screen coords to image coords
  const toImage = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - offset.x) / scale,
        y: (clientY - rect.top - offset.y) / scale,
      };
    },
    [scale, offset],
  );

  // Latest view for the native wheel listener (avoids re-attaching on every zoom)
  const viewRef = useRef({ scale, offset });
  viewRef.current = { scale, offset };

  // Zoom around a canvas-local point
  const zoomAt = useCallback((mx: number, my: number, factor: number) => {
    const { scale: s, offset: o } = viewRef.current;
    const next = Math.max(0.1, Math.min(10, s * factor));
    setOffset({ x: mx - ((mx - o.x) / s) * next, y: my - ((my - o.y) / s) * next });
    setScale(next);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }, [zoomAt]);

  // Wheel zoom is opt-in (ctrl/⌘ + scroll) so plain scrolling still moves the
  // page. Attached natively because React's wheel listeners are passive and
  // cannot preventDefault the browser's ctrl+scroll page-zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.89);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Pointer down
  const handlePointerDown = useCallback(
    (e: RPointerEvent) => {
      const p = toImage(e.clientX, e.clientY);
      if (drawMode) {
        setDrawing({ sx: p.x, sy: p.y, cx: p.x, cy: p.y });
        (e.target as Element).setPointerCapture(e.pointerId);
      } else if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        // Middle-click or ctrl+click = pan
        setPanning({ sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y });
        (e.target as Element).setPointerCapture(e.pointerId);
      } else {
        // Click to select/deselect region
        for (let i = regions.length - 1; i >= 0; i--) {
          const r = regions[i];
          if (
            p.x >= r.bbox.x &&
            p.x <= r.bbox.x + r.bbox.width &&
            p.y >= r.bbox.y &&
            p.y <= r.bbox.y + r.bbox.height
          ) {
            onRegionClick(r.id);
            return;
          }
        }
      }
    },
    [drawMode, toImage, regions, onRegionClick, offset],
  );

  const handlePointerMove = useCallback(
    (e: RPointerEvent) => {
      if (drawing) {
        const p = toImage(e.clientX, e.clientY);
        setDrawing((d) => (d ? { ...d, cx: p.x, cy: p.y } : null));
      } else if (panning) {
        setOffset({
          x: panning.ox + (e.clientX - panning.sx),
          y: panning.oy + (e.clientY - panning.sy),
        });
      }
    },
    [drawing, panning, toImage],
  );

  const handlePointerUp = useCallback(() => {
    if (drawing) {
      const x = Math.min(drawing.sx, drawing.cx);
      const y = Math.min(drawing.sy, drawing.cy);
      const w = Math.abs(drawing.cx - drawing.sx);
      const h = Math.abs(drawing.cy - drawing.sy);
      if (w > 5 && h > 5) {
        onDrawComplete({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
      }
      setDrawing(null);
    }
    setPanning(null);
  }, [drawing, onDrawComplete]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-stone-800 bg-coal-950"
    >
      <canvas
        ref={canvasRef}
        className={drawMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => {
          if (!drawMode) fitToContainer();
        }}
      />

      {/* View controls — zoom in/out and reset back to the fitted size */}
      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-stone-800 bg-coal-900/85 backdrop-blur-sm">
        <button
          title="Zoom in"
          onClick={() => zoomBy(1.2)}
          className="p-1.5 text-stone-400 transition-colors hover:bg-stone-800/50 hover:text-gold-300"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          title="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
          className="border-t border-stone-800 p-1.5 text-stone-400 transition-colors hover:bg-stone-800/50 hover:text-gold-300"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          title="Fit to view"
          onClick={fitToContainer}
          className="border-t border-stone-800 p-1.5 text-stone-400 transition-colors hover:bg-stone-800/50 hover:text-gold-300"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-coal-900/70 px-2 py-1 text-[10px] text-stone-500 backdrop-blur-sm">
        Ctrl + scroll to zoom · middle-drag to pan · double-click to fit
      </p>
      {!imgLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-600">
          Loading image…
        </div>
      )}
    </div>
  );
}
