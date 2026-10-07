// ─────────────────────────────────────────────────────────────────────────────
// PII Classifier — pure regex/rule-based classification.
// No AI, no network, deterministic.  Returns all matching PII types for a
// given text snippet together with a confidence score.
// ─────────────────────────────────────────────────────────────────────────────
import type { PIIType } from "./detector";

export interface PIIMatch {
  type: PIIType;
  confidence: number;
}

// ── individual matchers ─────────────────────────────────────────────────────

// Indian mobile: optional +91/0 prefix, then 6-9 followed by 9 digits
const PHONE_IN = /(?:\+91[\s-]?|0)?([6-9]\d{9})\b/;
// International: +<country 1-3 digits> then 7-12 digits with optional separators
const PHONE_INTL = /\+\d{1,3}[\s-]?\d{7,12}\b/;

const EMAIL_RE =
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

// Aadhaar: 4-4-4 digits (optionally space-separated).  First digit is 2-9.
const AADHAAR_RE = /\b([2-9]\d{3})\s?(\d{4})\s?(\d{4})\b/;

// Indian PAN: 5 alpha + 4 digits + 1 alpha
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/;

// Credit/debit card: 13–19 digits, optionally separated by spaces/dashes
const CARD_RE = /\b(\d[\d\s-]{11,22}\d)\b/;

// Date of birth patterns (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.)
const DOB_RE =
  /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/;

// Bank account: 9–18 digit number (needs context to reduce false positives)
const BANK_ACCT_RE = /\b\d{9,18}\b/;

// ── Luhn algorithm ──────────────────────────────────────────────────────────

function luhn(digits: string): boolean {
  const arr = digits.split("").map(Number);
  let sum = 0;
  let alt = false;
  for (let i = arr.length - 1; i >= 0; i--) {
    let n = arr[i];
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ── Verhoeff checksum for Aadhaar ───────────────────────────────────────────

const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];
// const VERHOEFF_INV = [0,4,3,2,1,5,6,7,8,9]; // not needed for check

function verhoeff(num: string): boolean {
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}

// ── context keywords that boost confidence ──────────────────────────────────

const PHONE_CONTEXT =
  /\b(phone|mobile|mob|cell|tel|contact|call|whatsapp|ph)\b/i;
const EMAIL_CONTEXT =
  /\b(email|e-mail|mail|contact)\b/i;
const AADHAAR_CONTEXT =
  /\b(aadhaar|aadhar|uid|uidai)\b/i;
const PAN_CONTEXT =
  /\b(pan|permanent\s*account|income\s*tax)\b/i;
const CARD_CONTEXT =
  /\b(card|credit|debit|visa|master|rupay|amex)\b/i;
const DOB_CONTEXT =
  /\b(dob|date\s*of\s*birth|born|birthday|birth\s*date)\b/i;
const BANK_CONTEXT =
  /\b(account|a\/c|acct|bank|ifsc|neft|rtgs)\b/i;
const NAME_CONTEXT =
  /\b(name|applicant|holder|customer|beneficiary|mr|mrs|ms|dr|shri|smt)\b/i;
const ADDR_CONTEXT =
  /\b(address|addr|residence|city|state|district|pin|pincode|postal)\b/i;

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Classify a text snippet, returning all matching PII types.
 * `surroundingText` is the broader text context (same line or nearby lines)
 * used to boost confidence via keyword proximity.
 */
export function classifyText(
  text: string,
  surroundingText = "",
): PIIMatch[] {
  const t = text.trim();
  if (!t) return [];

  const ctx = surroundingText || t;
  const matches: PIIMatch[] = [];

  // ── Phone ─────────────────────────────────────────────────────────────────
  if (PHONE_IN.test(t) || PHONE_INTL.test(t)) {
    let conf = 0.82;
    if (PHONE_CONTEXT.test(ctx)) conf = 0.96;
    matches.push({ type: "PHONE_NUMBER", confidence: conf });
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (EMAIL_RE.test(t)) {
    let conf = 0.92;
    if (EMAIL_CONTEXT.test(ctx)) conf = 0.98;
    matches.push({ type: "EMAIL", confidence: conf });
  }

  // ── Aadhaar ───────────────────────────────────────────────────────────────
  const aadhaarM = t.match(AADHAAR_RE);
  if (aadhaarM) {
    const digits = (aadhaarM[1] + aadhaarM[2] + aadhaarM[3]);
    let conf = 0.70;
    if (verhoeff(digits)) conf = 0.92;
    if (AADHAAR_CONTEXT.test(ctx)) conf = Math.min(1, conf + 0.06);
    matches.push({ type: "AADHAAR", confidence: conf });
  }

  // ── PAN ───────────────────────────────────────────────────────────────────
  if (PAN_RE.test(t)) {
    let conf = 0.88;
    if (PAN_CONTEXT.test(ctx)) conf = 0.96;
    matches.push({ type: "PAN", confidence: conf });
  }

  // ── Credit / debit card ───────────────────────────────────────────────────
  const cardM = t.match(CARD_RE);
  if (cardM) {
    const digits = cardM[1].replace(/[\s-]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && /^\d+$/.test(digits)) {
      let conf = 0.60;
      if (luhn(digits)) conf = 0.90;
      const hasCardCtx = CARD_CONTEXT.test(ctx);
      if (hasCardCtx) conf = Math.min(1, conf + 0.06);
      // Only exclude when Aadhaar/phone matched AND no card-specific context
      const dominated = (aadhaarM || PHONE_IN.test(t)) && !hasCardCtx;
      if (!dominated) {
        matches.push({ type: "CREDIT_CARD", confidence: conf });
      }
    }
  }

  // ── Date of birth ─────────────────────────────────────────────────────────
  if (DOB_RE.test(t)) {
    let conf = 0.50;
    if (DOB_CONTEXT.test(ctx)) conf = 0.88;
    matches.push({ type: "DATE_OF_BIRTH", confidence: conf });
  }

  // ── Bank account (only with context — too many false positives otherwise)
  if (BANK_CONTEXT.test(ctx) && BANK_ACCT_RE.test(t)) {
    const digits = t.match(BANK_ACCT_RE)![0];
    // Exclude if already matched as Aadhaar or card
    if (!aadhaarM && digits.length >= 9) {
      matches.push({ type: "BANK_ACCOUNT", confidence: 0.78 });
    }
  }

  // ── Name (heuristic) ─────────────────────────────────────────────────────
  // Title-case words near context keywords
  if (NAME_CONTEXT.test(ctx)) {
    const nameish = /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,4}\b/.test(t);
    if (nameish) {
      matches.push({ type: "NAME", confidence: 0.72 });
    }
  }

  // ── Address (heuristic) ───────────────────────────────────────────────────
  if (ADDR_CONTEXT.test(ctx)) {
    // Contains a PIN code pattern
    if (/\b\d{6}\b/.test(t)) {
      matches.push({ type: "ADDRESS", confidence: 0.68 });
    }
  }

  return matches;
}

/**
 * Pick the highest-confidence match for a given text snippet.
 * Returns null if no PII is detected.
 */
export function classifyBest(
  text: string,
  surroundingText = "",
): PIIMatch | null {
  const all = classifyText(text, surroundingText);
  if (all.length === 0) return null;
  return all.reduce((best, m) => (m.confidence > best.confidence ? m : best));
}
