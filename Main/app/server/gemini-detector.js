// ─────────────────────────────────────────────────────────────────────────────
// AI vision detector for the selective-encryption workflow.
//
// Two providers are supported (first match wins):
//   1. Any OpenAI-compatible chat-completions endpoint with vision:
//        AI_API_KEY + AI_BASE_URL (e.g. https://xkiro.com/v1) + AI_MODEL
//   2. Google Gemini via @google/genai:
//        GEMINI_API_KEY (+ optional GEMINI_MODEL)
//
// The image is sent to the AI server-side; only bounding boxes come back.
// Every returned box is validated, clamped and de-duplicated before it
// reaches the frontend, so a hallucinated or malformed detection is
// dropped — never drawn.
// ─────────────────────────────────────────────────────────────────────────────

const DETECTION_PROMPT = `You are a precise document-analysis engine. Examine the attached image and locate every visible piece of sensitive personal information.

Strict rules:
- Report ONLY items you can actually see and point to. Never guess or invent a box.
- If you are not sure exactly where something is, do NOT report it.
- If there is no sensitive information in the image, respond with exactly: []
- Each box must wrap ONLY the item itself (tight, small margin) — never the whole page or large background areas.

Items to look for: signatures, QR codes, barcodes, phone numbers, email addresses, Aadhaar numbers, PAN numbers, passport numbers, driver's license numbers, bank account numbers, credit/debit card numbers, person names, postal addresses, dates of birth, handwritten personal information.

Respond with ONLY a raw JSON array — no markdown fences, no commentary. Each element:
{"type": "<TYPE>", "confidence": <0.0-1.0>, "text": "<the visible text, or empty string>", "box_2d": [ymin, xmin, ymax, xmax]}

<type> is one of: SIGNATURE, QR_BARCODE, PHONE_NUMBER, EMAIL, AADHAAR, PAN, PASSPORT, DRIVERS_LICENSE, BANK_ACCOUNT, CREDIT_CARD, NAME, ADDRESS, DATE_OF_BIRTH, HANDWRITTEN, OTHER

box_2d coordinates are relative to the image, scaled to 0-1000:
- ymin: distance from the TOP edge (0 = top, 1000 = bottom)
- xmin: distance from the LEFT edge (0 = left, 1000 = right)
- ymax, xmax: the bottom-right corner of the item

Example:
[{"type":"PHONE_NUMBER","confidence":0.93,"text":"+91 98765 43210","box_2d":[120,340,168,610]}]`;

// Map AI types to our internal PIIType
const TYPE_MAP = {
  SIGNATURE: "SIGNATURE",
  QR_BARCODE: "QR_BARCODE",
  QR_CODE: "QR_BARCODE",
  BARCODE: "QR_BARCODE",
  PHONE_NUMBER: "PHONE_NUMBER",
  PHONE: "PHONE_NUMBER",
  EMAIL: "EMAIL",
  EMAIL_ADDRESS: "EMAIL",
  AADHAAR: "AADHAAR",
  AADHAR: "AADHAAR",
  PAN: "PAN",
  PASSPORT: "CUSTOM",
  DRIVERS_LICENSE: "CUSTOM",
  BANK_ACCOUNT: "BANK_ACCOUNT",
  CREDIT_CARD: "CREDIT_CARD",
  DEBIT_CARD: "CREDIT_CARD",
  NAME: "NAME",
  ADDRESS: "ADDRESS",
  DATE_OF_BIRTH: "DATE_OF_BIRTH",
  DOB: "DATE_OF_BIRTH",
  HANDWRITTEN: "SIGNATURE",
  OTHER: "CUSTOM",
};

const LABEL_MAP = {
  SIGNATURE: "Signature",
  QR_BARCODE: "QR / Barcode",
  PHONE_NUMBER: "Phone Number",
  EMAIL: "Email Address",
  AADHAAR: "Aadhaar Number",
  PAN: "PAN",
  BANK_ACCOUNT: "Bank Account",
  CREDIT_CARD: "Credit/Debit Card",
  NAME: "Name",
  ADDRESS: "Address",
  DATE_OF_BIRTH: "Date of Birth",
  CUSTOM: "Sensitive Info",
};

/**
 * Detect sensitive regions in an image using the configured AI provider.
 *
 * @param {Buffer} imageBuffer — raw image file bytes (PNG/JPEG)
 * @param {number} imageWidth  — decoded image width in pixels
 * @param {number} imageHeight — decoded image height in pixels
 * @returns {Promise<{ regions: Array, detector: string }>}
 */
export async function detectRegions(imageBuffer, imageWidth, imageHeight) {
  const openaiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const geminiKey = process.env.GEMINI_API_KEY;

  let rawText;
  let detector;
  if (openaiKey && baseUrl && model) {
    detector = `${model} @ ${new URL(baseUrl).host}`;
    rawText = await callOpenAICompatible(openaiKey, baseUrl, model, imageBuffer);
  } else if (geminiKey) {
    detector = "gemini";
    rawText = await callGemini(geminiKey, imageBuffer);
  } else {
    throw new Error(
      "No AI detector is configured. Set AI_API_KEY, AI_BASE_URL and AI_MODEL " +
      "(or GEMINI_API_KEY) in Main/app/.env, then restart the server.",
    );
  }

  const detections = parseDetections(rawText);
  const regions = toRegions(detections, imageWidth, imageHeight);
  console.log(`AI detection: ${detections.length} raw → ${regions.length} valid regions (${detector})`);
  return { regions, detector };
}

// ── providers ────────────────────────────────────────────────────────────────

async function callOpenAICompatible(apiKey, baseUrl, model, imageBuffer) {
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const dataUrl = `data:${detectMimeType(imageBuffer)};base64,${imageBuffer.toString("base64")}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DETECTION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI detection request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const msg = json.choices?.[0]?.message?.content;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg)) {
    return msg.map((p) => (typeof p === "string" ? p : p?.text || "")).join("\n");
  }
  throw new Error("AI detection returned no content.");
}

async function callGemini(apiKey, imageBuffer) {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.7-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: DETECTION_PROMPT },
          { inlineData: { mimeType: detectMimeType(imageBuffer), data: imageBuffer.toString("base64") } },
        ],
      },
    ],
  });

  return response.text || "";
}

// ── response parsing + validation ────────────────────────────────────────────

function parseDetections(text) {
  if (!text) return [];
  try {
    // Strip markdown fences / stray prose, keep the outermost JSON array.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("AI response parse error:", e.message, "\nRaw response:", text.slice(0, 1000));
    return [];
  }
}

function toRegions(detections, imageWidth, imageHeight) {
  const regions = [];
  for (const det of detections) {
    try {
      const raw = det?.box_2d || det?.bbox || det?.bounding_box;
      if (!Array.isArray(raw) || raw.length !== 4) continue;
      if (!raw.every((v) => Number.isFinite(v))) continue;

      // Detect the coordinate scale: 0-1 floats, 0-1000 normalized, or pixels.
      const maxAbs = Math.max(...raw.map(Math.abs));
      let [ymin, xmin, ymax, xmax] = raw;
      if (maxAbs <= 1.05) {
        ymin *= 1000; xmin *= 1000; ymax *= 1000; xmax *= 1000;
      } else if (maxAbs > 1000) {
        // Model ignored the prompt and returned pixels — clamp below.
        ymin = (ymin / imageHeight) * 1000;
        ymax = (ymax / imageHeight) * 1000;
        xmin = (xmin / imageWidth) * 1000;
        xmax = (xmax / imageWidth) * 1000;
      }

      // Tolerate inverted corners.
      if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
      if (xmin > xmax) [xmin, xmax] = [xmax, xmin];

      // Normalized (0-1000) → pixel coordinates.
      const x = Math.round((xmin / 1000) * imageWidth);
      const y = Math.round((ymin / 1000) * imageHeight);
      const w = Math.round(((xmax - xmin) / 1000) * imageWidth);
      const h = Math.round(((ymax - ymin) / 1000) * imageHeight);

      // Clamp into the image.
      const cx = Math.max(0, Math.min(x, imageWidth - 1));
      const cy = Math.max(0, Math.min(y, imageHeight - 1));
      const cw = Math.min(w, imageWidth - cx);
      const ch = Math.min(h, imageHeight - cy);

      // Hallucination filters — drop anything implausible.
      if (cw < 8 || ch < 8) continue;                                  // too small to be real
      if (cw * ch > 0.75 * imageWidth * imageHeight) continue;        // nearly the whole page
      const aspect = cw / ch;
      if (aspect > 30 || aspect < 1 / 30) continue;                   // absurd slivers

      const type = TYPE_MAP[String(det.type || "").toUpperCase()] || "CUSTOM";
      regions.push({
        type,
        label: LABEL_MAP[type] || String(det.type || "Sensitive Info"),
        text: typeof det.text === "string" ? det.text : "",
        confidence: Math.max(0, Math.min(1, Number(det.confidence) || 0.75)),
        bbox: { x: cx, y: cy, width: cw, height: ch },
      });
    } catch {
      continue; // skip malformed entries
    }
  }

  // De-duplicate near-identical boxes, keeping the highest-confidence one.
  regions.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const r of regions) {
    if (!kept.some((k) => iou(k.bbox, r.bbox) > 0.7)) kept.push(r);
  }
  return kept;
}

function iou(a, b) {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = ox * oy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function detectMimeType(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  return "image/png";
}
