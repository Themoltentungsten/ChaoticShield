// ─────────────────────────────────────────────────────────────────────────────
// Selective-encryption detection interfaces & shared types.
// All detection runs client-side. The server only receives bounding-box
// coordinates + the user's password for the actual AES-256-GCM encryption.
// ─────────────────────────────────────────────────────────────────────────────

/** Supported PII categories. */
export type PIIType =
  | "PHONE_NUMBER"
  | "EMAIL"
  | "AADHAAR"
  | "PAN"
  | "CREDIT_CARD"
  | "BANK_ACCOUNT"
  | "DATE_OF_BIRTH"
  | "NAME"
  | "ADDRESS"
  | "QR_BARCODE"
  | "SIGNATURE"
  | "CUSTOM";

/** Confidence bucket. */
export type ConfidenceLevel = "high" | "medium" | "low";

/** A single detected sensitive region. */
export interface DetectedRegion {
  /** Unique identifier for this region (client-generated UUID). */
  id: string;
  /** PII category. */
  type: PIIType;
  /** Display label (e.g. "Phone Number"). */
  label: string;
  /** The detected text (if OCR-sourced). */
  text: string;
  /** Combined confidence 0–1. */
  confidence: number;
  /** Bucketed confidence. */
  confidenceLevel: ConfidenceLevel;
  /** Detection source. */
  source: "OCR+Regex" | "Gemini" | "AI" | "Manual";
  /** Bounding box in *original-image* pixel coordinates. */
  bbox: RegionBBox;
  /** Whether the user has selected this region for encryption. */
  selected: boolean;
}

/** Axis-aligned rectangle in image pixels. */
export interface RegionBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Progress callback payload sent during detection. */
export interface DetectionProgress {
  stage: "loading" | "recognizing" | "classifying" | "done";
  message: string;
  /** 0–1 */
  progress: number;
}

/** Abstract detector interface. */
export interface SensitiveDataDetector {
  detect(
    image: HTMLImageElement | HTMLCanvasElement | ImageData,
    onProgress?: (p: DetectionProgress) => void,
  ): Promise<DetectedRegion[]>;
  destroy(): void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function confidenceLevel(c: number): ConfidenceLevel {
  if (c >= 0.9) return "high";
  if (c >= 0.7) return "medium";
  return "low";
}

/** Display name for a PII type. */
export const PII_LABELS: Record<PIIType, string> = {
  PHONE_NUMBER: "Phone Number",
  EMAIL: "Email Address",
  AADHAAR: "Aadhaar Number",
  PAN: "PAN",
  CREDIT_CARD: "Credit/Debit Card",
  BANK_ACCOUNT: "Bank Account",
  DATE_OF_BIRTH: "Date of Birth",
  NAME: "Name",
  ADDRESS: "Address",
  QR_BARCODE: "QR / Barcode",
  SIGNATURE: "Signature",
  CUSTOM: "Custom Region",
};

/** Color for each PII type (used in canvas overlay). */
export const PII_COLORS: Record<PIIType, string> = {
  PHONE_NUMBER: "#ef4444",
  EMAIL: "#f97316",
  AADHAAR: "#eab308",
  PAN: "#22c55e",
  CREDIT_CARD: "#3b82f6",
  BANK_ACCOUNT: "#8b5cf6",
  DATE_OF_BIRTH: "#ec4899",
  NAME: "#14b8a6",
  ADDRESS: "#6366f1",
  QR_BARCODE: "#a855f7",
  SIGNATURE: "#f43f5e",
  CUSTOM: "#d4af37",
};

let _counter = 0;
export function genRegionId(): string {
  return `r-${Date.now().toString(36)}-${(++_counter).toString(36)}`;
}
