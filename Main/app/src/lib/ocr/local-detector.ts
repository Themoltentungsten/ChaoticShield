// ─────────────────────────────────────────────────────────────────────────────
// Local OCR detector — runs Tesseract.js entirely in the browser.
// No image data ever leaves the client for detection.
//
// Detection pipeline:
//   1. Tesseract.js OCR → text + bounding boxes → PII classifier (regex)
//   2. Visual heuristics on canvas pixel data → QR codes + signatures
// ─────────────────────────────────────────────────────────────────────────────
import Tesseract from "tesseract.js";
import { classifyBest } from "./pii-classifier";
import {
  confidenceLevel,
  genRegionId,
  PII_LABELS,
  type DetectedRegion,
  type DetectionProgress,
  type RegionBBox,
  type SensitiveDataDetector,
} from "./detector";

export class LocalDetector implements SensitiveDataDetector {
  private worker: Tesseract.Worker | null = null;

  async detect(
    image: HTMLImageElement | HTMLCanvasElement | ImageData,
    onProgress?: (p: DetectionProgress) => void,
  ): Promise<DetectedRegion[]> {
    const report = (stage: DetectionProgress["stage"], message: string, progress: number) => {
      onProgress?.({ stage, message, progress });
    };

    // 1. Initialize Tesseract worker (loads WASM + eng data once, then cached)
    report("loading", "Initializing OCR engine…", 0.05);
    if (!this.worker) {
      this.worker = await Tesseract.createWorker("eng", Tesseract.OEM.DEFAULT, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            report("recognizing", "Recognizing text…", 0.2 + (m.progress ?? 0) * 0.4);
          }
        },
      });
    }

    // 2. Get a canvas for both OCR input and pixel analysis
    report("recognizing", "Scanning for text…", 0.2);

    let canvas: HTMLCanvasElement;
    if (image instanceof HTMLCanvasElement) {
      canvas = image;
    } else {
      canvas = document.createElement("canvas");
      if (image instanceof HTMLImageElement) {
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
      } else {
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d")!.putImageData(image, 0, 0);
      }
    }

    const result = await this.worker.recognize(canvas);
    const words = result.data.words ?? [];

    // 3. Build text lines from words for context
    const lines = result.data.lines ?? [];
    const lineTexts = lines.map((l) => l.text);

    // 4. Classify each line through the PII regex classifier
    report("classifying", `Classifying ${words.length} text segments…`, 0.65);

    const regions: DetectedRegion[] = [];

    for (const line of lines) {
      const lineText = line.text.trim();
      if (!lineText) continue;

      const surrounding = lineTexts.join(" ");
      const match = classifyBest(lineText, surrounding);
      if (!match) continue;

      const ocrConf = (line.confidence ?? 80) / 100;
      const combined = match.confidence * ocrConf;
      const bbox = line.bbox;

      regions.push({
        id: genRegionId(),
        type: match.type,
        label: PII_LABELS[match.type],
        text: lineText,
        confidence: +combined.toFixed(2),
        confidenceLevel: confidenceLevel(combined),
        source: "OCR+Regex",
        bbox: {
          x: bbox.x0,
          y: bbox.y0,
          width: bbox.x1 - bbox.x0,
          height: bbox.y1 - bbox.y0,
        },
        selected: combined >= 0.7,
      });
    }

    // 5. Visual heuristic detection for QR codes and signatures
    report("classifying", "Scanning for QR codes and signatures…", 0.8);

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);

      // Collect OCR text bounding boxes to avoid overlapping detections
      const textBBoxes: RegionBBox[] = lines.map((l) => ({
        x: l.bbox.x0,
        y: l.bbox.y0,
        width: l.bbox.x1 - l.bbox.x0,
        height: l.bbox.y1 - l.bbox.y0,
      }));

      const qrRegions = detectQRBarcodeRegions(imageData, imgWidth, imgHeight, textBBoxes);
      regions.push(...qrRegions);

      const sigRegions = detectSignatureRegions(imageData, imgWidth, imgHeight, textBBoxes);
      regions.push(...sigRegions);
    }

    // 6. Merge overlapping regions of the same type
    const merged = mergeOverlapping(regions);

    report("done", `Found ${merged.length} sensitive region${merged.length === 1 ? "" : "s"}.`, 1);
    return merged;
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

// ── Visual heuristic: QR code / barcode detection ────────────────────────────
// Scans the image in a grid of blocks. A QR/barcode region has:
//  - Very high contrast (many black + white pixels, bimodal distribution)
//  - High edge density from the data modules
//  - Clustered together in a contiguous patch
// We scan in blocks, cluster adjacent high-contrast blocks via flood-fill.

function detectQRBarcodeRegions(
  imageData: ImageData,
  w: number,
  h: number,
  textBBoxes: RegionBBox[],
): DetectedRegion[] {
  // Finer grid + looser thresholds — real-world scans/photos of documents
  // often have small, JPEG-compressed QR codes where contrast and edge
  // density are diluted, so overly strict thresholds miss them entirely.
  const blockSize = Math.max(10, Math.min(28, Math.floor(Math.min(w, h) / 28)));
  const cols = Math.ceil(w / blockSize);
  const rows = Math.ceil(h / blockSize);
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const px = imageData.data;

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * blockSize;
      const y0 = by * blockSize;
      const x1 = Math.min(x0 + blockSize, w);
      const y1 = Math.min(y0 + blockSize, h);
      let dark = 0, light = 0, total = 0, edgeCount = 0, edgeSamples = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (lum < 90) dark++;
          else if (lum > 170) light++;
          total++;
          // Horizontal edge
          if (x > x0) {
            const pi = (y * w + x - 1) * 4;
            const prevLum = 0.299 * px[pi] + 0.587 * px[pi + 1] + 0.114 * px[pi + 2];
            if (Math.abs(lum - prevLum) > 70) edgeCount++;
            edgeSamples++;
          }
          // Vertical edge
          if (y > y0) {
            const pi = ((y - 1) * w + x) * 4;
            const prevLum = 0.299 * px[pi] + 0.587 * px[pi + 1] + 0.114 * px[pi + 2];
            if (Math.abs(lum - prevLum) > 70) edgeCount++;
            edgeSamples++;
          }
        }
      }

      const darkRatio = dark / total;
      const lightRatio = light / total;
      const edgeRatio = edgeSamples > 0 ? edgeCount / edgeSamples : 0;
      grid[by][bx] = darkRatio > 0.12 && lightRatio > 0.12 && edgeRatio > 0.08;
    }
  }

  // Flood-fill to cluster adjacent QR blocks
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const clusters: RegionBBox[] = [];

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      if (!grid[by][bx] || visited[by][bx]) continue;
      let minX = bx, maxX = bx, minY = by, maxY = by;
      let count = 0;
      const queue: [number, number][] = [[bx, by]];
      visited[by][bx] = true;
      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        count++;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny][nx] && !visited[ny][nx]) {
            visited[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }

      const clusterW = maxX - minX + 1;
      const clusterH = maxY - minY + 1;
      if (count >= 2 && (clusterW >= 2 || clusterH >= 2)) {
        const bbox: RegionBBox = {
          x: minX * blockSize,
          y: minY * blockSize,
          width: clusterW * blockSize,
          height: clusterH * blockSize,
        };
        const textOverlap = textBBoxes.some((tb) => bboxOverlapRatio(bbox, tb) > 0.6);
        if (!textOverlap) clusters.push(bbox);
      }
    }
  }

  return clusters.map((bbox) => {
    const aspect = bbox.width / bbox.height;
    const isSquareish = aspect > 0.6 && aspect < 1.6;
    return {
      id: genRegionId(),
      type: "QR_BARCODE" as const,
      label: isSquareish ? "QR Code" : "Barcode",
      text: "",
      confidence: 0.78,
      confidenceLevel: "medium" as const,
      source: "OCR+Regex" as const,
      bbox,
      selected: true,
    };
  });
}

// ── Visual heuristic: Signature detection ────────────────────────────────────
// Signatures are handwritten ink strokes on a lighter background.
// Scan in blocks, look for regions with:
//  - Moderate dark pixel density (ink strokes, not solid fills): 5–40%
//  - High light pixel ratio (paper background): >35%
//  - Low overlap with OCR text (handwriting is not typed text)
//  - Horizontally elongated clusters (signatures are wider than tall)

function detectSignatureRegions(
  imageData: ImageData,
  w: number,
  h: number,
  textBBoxes: RegionBBox[],
): DetectedRegion[] {
  // Finer grid + looser thresholds — handwritten signatures vary a lot in
  // ink density, size, and shape, so overly strict per-block/cluster rules
  // caused real signatures to be missed entirely.
  const blockSize = Math.max(16, Math.min(40, Math.floor(Math.min(w, h) / 16)));
  const cols = Math.ceil(w / blockSize);
  const rows = Math.ceil(h / blockSize);
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const px = imageData.data;

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * blockSize;
      const y0 = by * blockSize;
      const x1 = Math.min(x0 + blockSize, w);
      const y1 = Math.min(y0 + blockSize, h);
      let dark = 0, light = 0, total = 0, sumLum = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          sumLum += lum;
          if (lum < 120) dark++;
          if (lum > 190) light++;
          total++;
        }
      }

      const darkRatio = dark / total;
      const lightRatio = light / total;
      const avgLum = sumLum / total;

      // Signature block: scattered dark strokes on light paper
      const isSignatureBlock =
        darkRatio >= 0.02 && darkRatio <= 0.50 &&
        lightRatio >= 0.25 &&
        avgLum > 130;

      // Must not be heavily covered by recognized (typed) text
      const blockBBox: RegionBBox = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      const textCoverage = textBBoxes.reduce(
        (max, tb) => Math.max(max, bboxOverlapRatio(blockBBox, tb)), 0,
      );

      grid[by][bx] = isSignatureBlock && textCoverage < 0.5;
    }
  }

  // Cluster adjacent signature blocks via flood-fill
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const clusters: RegionBBox[] = [];

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      if (!grid[by][bx] || visited[by][bx]) continue;
      let minX = bx, maxX = bx, minY = by, maxY = by;
      let count = 0;
      const queue: [number, number][] = [[bx, by]];
      visited[by][bx] = true;
      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        count++;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny][nx] && !visited[ny][nx]) {
            visited[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }

      const clusterW = maxX - minX + 1;
      const clusterH = maxY - minY + 1;
      const aspect = clusterW / clusterH;

      // Signatures are usually somewhat wider than tall, but allow
      // near-square or single-block clusters too since small/compact
      // signatures and cramped signature boxes are common on real forms.
      if (count >= 1 && aspect >= 0.6) {
        clusters.push({
          x: minX * blockSize,
          y: minY * blockSize,
          width: clusterW * blockSize,
          height: clusterH * blockSize,
        });
      }
    }
  }

  return clusters.map((bbox) => ({
    id: genRegionId(),
    type: "SIGNATURE" as const,
    label: PII_LABELS.SIGNATURE,
    text: "",
    confidence: 0.72,
    confidenceLevel: "medium" as const,
    source: "OCR+Regex" as const,
    bbox,
    selected: true,
  }));
}

// ── bbox helpers ─────────────────────────────────────────────────────────────

function bboxOverlapRatio(a: RegionBBox, b: RegionBBox): number {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlap = ox * oy;
  const areaA = a.width * a.height;
  return areaA > 0 ? overlap / areaA : 0;
}

function bboxOverlaps(
  a: RegionBBox,
  b: RegionBBox,
  margin = 8,
): boolean {
  return (
    a.x - margin < b.x + b.width &&
    a.x + a.width + margin > b.x &&
    a.y - margin < b.y + b.height &&
    a.y + a.height + margin > b.y
  );
}

function mergeBBox(a: RegionBBox, b: RegionBBox): RegionBBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function mergeOverlapping(regions: DetectedRegion[]): DetectedRegion[] {
  if (regions.length <= 1) return regions;
  const merged: DetectedRegion[] = [];
  const used = new Set<number>();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    let current = { ...regions[i], bbox: { ...regions[i].bbox } };
    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      if (current.type === regions[j].type && bboxOverlaps(current.bbox, regions[j].bbox)) {
        current.bbox = mergeBBox(current.bbox, regions[j].bbox);
        current.confidence = Math.max(current.confidence, regions[j].confidence);
        current.confidenceLevel = confidenceLevel(current.confidence);
        current.text += " " + regions[j].text;
        used.add(j);
      }
    }
    merged.push(current);
  }
  return merged;
}
