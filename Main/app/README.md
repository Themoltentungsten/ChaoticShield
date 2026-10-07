# ChaoticShield — Image Encryption System

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A production-ready image encryption system featuring **hybrid chaotic encryption** and **AI-powered selective encryption** for protecting sensitive information in documents.

---

## Features

### 🔐 Full Image Encryption
- **Hybrid Chaotic Encryption**: Arnold Cat Map + Logistic Map diffusion
- **Optional AES-256-GCM**: Industry-standard second layer
- **AI Parameter Selection**: Automatic optimization based on image features
- **Lossless RGB**: Native resolution, no quality loss
- **Performance Metrics**: NPCR, UACI, entropy, correlation analysis

### 🎯 Selective Encryption (AI-Powered)
- **Privacy-First**: OCR runs locally in browser (Tesseract.js)
- **Smart Detection**: Automatically identifies sensitive information:
  - 📱 Phone numbers (Indian + International)
  - 📧 Email addresses
  - 🆔 Aadhaar numbers (with Verhoeff checksum validation)
  - 🏦 PAN cards
  - 💳 Credit/debit cards (with Luhn algorithm validation)
  - 🏛️ Bank account numbers
  - 📅 Date of birth
  - 👤 Names (heuristic)
  - 📍 Addresses (heuristic)
  - 📱 QR codes & barcodes (visual detection)
  - ✍️ Signatures (visual detection)
- **Manual Controls**: Draw custom regions, adjust selections
- **Interactive Canvas**: Zoom, pan, click to select
- **AES-256-GCM**: Per-region authenticated encryption
- **Tamper Detection**: GCM authentication tags detect modifications

### 🔍 Security Features
- **Authenticated Encryption**: AES-256-GCM with unique IVs per region
- **Strong Key Derivation**: PBKDF2-SHA-512 (100,000 iterations)
- **Tamper Detection**: Cryptographic authentication prevents modifications
- **No Key Leakage**: Keys never stored in images
- **Local Processing**: No data sent to external services by default

---

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Modern browser (Chrome, Firefox, Edge, Safari)

### Installation

```bash
# Clone the repository
cd app

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:7100`

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

---

## Usage

### Full Image Encryption

1. Navigate to **Encrypt** page
2. Drop or select an image (PNG/JPEG, up to 2048×2048)
3. Choose **Auto** mode (AI selects optimal parameters) or **Manual** mode
4. Click **Encrypt**
5. Download:
   - Encrypted image (PNG)
   - Key file (JSON) — **Keep this safe!**

**Decryption:**
1. Navigate to **Decrypt** page
2. Upload encrypted image + key file
3. Enter password (if AES layer was used)
4. Click **Decrypt**
5. Download recovered image

### Selective Encryption

1. Navigate to **Selective Encrypt** page
2. Drop a document image (ID card, form, invoice, etc.)
3. Click **Scan for Sensitive Data**
4. Review detected regions:
   - ✅ Select/deselect regions
   - ➕ Add custom regions manually (click "Add Region", draw rectangle)
   - 🗑️ Delete false positives
5. Enter encryption password (twice)
6. Click **Encrypt [N] Regions**
7. Download:
   - Encrypted image with sensitive regions protected
   - Key file (JSON) — **Required for decryption!**

**Decryption:**
1. Navigate to **Selective Decrypt** page
2. Upload encrypted image + key file
3. Enter password
4. Click **Decrypt Regions**
5. Download decrypted image with original content restored

---

## Selective Encryption Technical Details

### Detection Pipeline

```
Image Upload
     ↓
OCR (Tesseract.js)
     ↓
Text Extraction + Bounding Boxes
     ↓
PII Classification (Regex + Context)
     ↓
Visual Detection (QR codes, signatures)
     ↓
Confidence Scoring
     ↓
Region Merging
     ↓
User Review
     ↓
Selective Encryption (AES-256-GCM)
```

### PII Detection Methods

| Type | Method | Confidence Boost |
|------|--------|------------------|
| Phone | Regex (Indian +91, International) | Context keywords: "phone", "mobile", "contact" |
| Email | Regex (RFC-compliant pattern) | Context keywords: "email", "mail" |
| Aadhaar | Regex + Verhoeff checksum | Context keywords: "aadhaar", "uid" |
| PAN | Regex (5 alpha + 4 digits + 1 alpha) | Context keywords: "pan", "permanent account" |
| Credit Card | Regex + Luhn algorithm | Context keywords: "card", "credit", "debit" |
| Bank Account | Regex (9-18 digits) + Context required | Context keywords: "account", "bank", "ifsc" |
| Date of Birth | Regex (DD/MM/YYYY, etc.) | Context keywords: "dob", "birth date" |
| QR Code | Visual (contrast + edge analysis) | Bimodal pixel distribution |
| Signature | Visual (ink density analysis) | Moderate dark pixels + high light background |

### Encryption Format

Each selected region is encrypted independently:

```javascript
{
  "version": 1,
  "scheme": "selective-aes-256-gcm",
  "width": 1920,
  "height": 1080,
  "channels": 3,
  "kdf": "pbkdf2-sha512-100000",
  "salt": "...", // hex-encoded random salt
  "regions": [
    {
      "x": 120,
      "y": 340,
      "width": 220,
      "height": 45,
      "iv": "...",      // unique 96-bit IV (hex)
      "tag": "...",     // 128-bit GCM auth tag (hex)
      "dataLength": 29700,
      "ciphertext": "...", // base64-encoded encrypted pixels
      "label": "PHONE_NUMBER"
    }
    // ... more regions
  ],
  "imageSha256": "...", // integrity check
  "createdAt": "2026-09-11T..."
}
```

### Security Properties

- **Confidentiality**: AES-256-GCM encrypts pixel data
- **Authenticity**: GCM tags authenticate each region
- **Integrity**: SHA-256 hash detects image tampering
- **Non-repudiation**: Password required for both encrypt/decrypt
- **Forward Secrecy**: Unique IV per region prevents pattern analysis

---

## API Documentation

### Health Check

```bash
GET /api/health
```

Response:
```json
{
  "ok": true,
  "scheme": "arnold-cat-map / chaotic-shuffle + logistic-map + aes-256-gcm",
  "mode": "lossless RGB, native resolution",
  "maxDim": 2048,
  "period256": 192
}
```

### Selective Encryption

#### Encrypt Regions

```bash
POST /api/selective/encrypt
Content-Type: multipart/form-data

Fields:
  image: File (PNG/JPEG)
  password: String (required)
  regions: JSON array of {x, y, width, height, label}
```

Response:
```json
{
  "encryptedPng": "data:image/png;base64,...",
  "keyFile": { /* metadata */ }
}
```

#### Decrypt Regions

```bash
POST /api/selective/decrypt
Content-Type: multipart/form-data

Fields:
  image: File (encrypted PNG)
  key: File (JSON key file)
  password: String (required)
```

Response:
```json
{
  "decryptedPng": "data:image/png;base64,...",
  "regionsDecrypted": 5
}
```

### Full Image Encryption

#### Encrypt

```bash
POST /api/encrypt
Content-Type: multipart/form-data

Fields:
  image: File (PNG/JPEG)
  mode: "auto" | "manual" (default: auto)
  password: String (optional, for AES layer)
  rounds: Number (manual mode only)
  seed: Number (manual mode only)
  r: Number (manual mode only)
  aes: "true" | "false" (manual mode only)
```

#### Decrypt

```bash
POST /api/decrypt
Content-Type: multipart/form-data

Fields:
  image: File (encrypted PNG)
  key: File (JSON key file)
  password: String (if AES layer used)
```

---

## Environment Configuration

Create a `.env` file (copy from `.env.example`):

```bash
# AI detection provider: "local" (default, in-browser Tesseract.js) or "cloud"
AI_PROVIDER=local

# Cloud AI API key (only used when AI_PROVIDER=cloud)
AI_API_KEY=

# Enable cloud AI processing (requires explicit user opt-in)
ENABLE_CLOUD_AI=false

# OCR engine for local detection: "tesseract" (default)
OCR_ENGINE=tesseract

# Server configuration
PORT=7100
HOST=0.0.0.0
```

---

## Project Structure

```
app/
├── src/
│   ├── components/
│   │   ├── selective/
│   │   │   ├── DetectionPanel.tsx    # Region list sidebar
│   │   │   └── RegionCanvas.tsx      # Interactive canvas
│   │   └── ...
│   ├── lib/
│   │   ├── ocr/
│   │   │   ├── detector.ts           # Detector interface
│   │   │   ├── local-detector.ts     # Tesseract.js implementation
│   │   │   ├── cloud-detector.ts     # Stub for cloud AI
│   │   │   └── pii-classifier.ts     # Regex-based PII detection
│   │   └── ...
│   ├── pages/
│   │   ├── SelectivePage.tsx         # Selective encryption UI
│   │   ├── SelectiveDecryptPage.tsx  # Selective decryption UI
│   │   └── ...
│   └── ...
├── server/
│   ├── crypto.js                     # Chaotic encryption
│   ├── selective-crypto.js           # AES-256-GCM region encryption
│   ├── image.js                      # Image encoding/decoding
│   ├── store.js                      # User data & history
│   └── index.js                      # Express API
└── ...
```

---

## Testing

### Manual Testing Checklist

**Selective Encryption:**
- [ ] Upload document with phone numbers, emails, Aadhaar
- [ ] Verify detection accuracy
- [ ] Select/deselect regions
- [ ] Add custom region manually
- [ ] Encrypt with strong password
- [ ] Download encrypted image + key file
- [ ] Decrypt with correct password
- [ ] Verify original content restored
- [ ] Test wrong password (should fail)
- [ ] Test tampered image (should fail)

**Full Encryption:**
- [ ] Upload various image types (PNG, JPEG)
- [ ] Test auto mode
- [ ] Test manual mode
- [ ] Verify encryption/decryption round-trip
- [ ] Check metrics (NPCR, UACI, entropy)

### Automated Tests

```bash
# Install vitest (test framework)
npm install -D vitest

# Run tests
npx vitest run
```

Test coverage:
- PII classifier (phone, email, Aadhaar, PAN, cards)
- Luhn algorithm validation
- Verhoeff checksum validation
- Region encryption/decryption
- Key derivation
- Tamper detection

---

## Security Considerations

### ✅ What This System Protects Against

- **Unauthorized viewing**: Encrypted regions are unreadable without password
- **Data tampering**: GCM authentication detects modifications
- **Brute force attacks**: PBKDF2 with 100K iterations slows password guessing
- **Pattern analysis**: Unique IVs prevent frequency analysis
- **Key recovery**: Keys derived from password, not stored

### ⚠️ What This System Does NOT Protect Against

- **Password compromise**: If attacker has password, they can decrypt
- **Weak passwords**: System accepts any password (recommend 12+ chars)
- **Metadata leakage**: Image dimensions and region count visible
- **Side-channel attacks**: No protection against timing attacks
- **Physical access**: If attacker has both image + key file + password

### Best Practices

1. **Use strong passwords**: 12+ characters, mixed case, numbers, symbols
2. **Store key files securely**: Separate from encrypted images
3. **Don't reuse passwords**: Each encryption should use unique password
4. **Verify authenticity**: Check file hashes before decryption
5. **Backup key files**: Lost key = permanently encrypted
6. **Use HTTPS**: If deployed publicly, enforce TLS

---

## Performance

### Benchmarks (approximate)

| Image Size | OCR Time | Encryption Time | Total |
|------------|----------|-----------------|-------|
| 800×600    | ~3-5s    | ~200ms          | ~5s   |
| 1920×1080  | ~8-12s   | ~500ms          | ~12s  |
| 2048×2048  | ~15-20s  | ~800ms          | ~20s  |

*Tested on: Intel i7-10th gen, 16GB RAM, Chrome 120*

**Factors affecting performance:**
- Text density (more text = longer OCR)
- Image quality (blur, noise slow OCR)
- Number of regions (more regions = longer encryption)
- Device CPU speed

---

## Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome  | 90+     | ✅ Full |
| Firefox | 88+     | ✅ Full |
| Safari  | 14+     | ✅ Full |
| Edge    | 90+     | ✅ Full |

**Requirements:**
- WebAssembly support (for Tesseract.js)
- Canvas API (for image processing)
- Crypto API (for random number generation)
- Modern JavaScript (ES2020+)

---

## Deployment

### Docker (Recommended)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 7100
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t chaoticshield .
docker run -p 7100:7100 chaoticshield
```

### Traditional

```bash
# Install dependencies
npm ci --only=production

# Build
npm run build

# Start
NODE_ENV=production npm start
```

---

## Troubleshooting

### OCR not detecting text
- **Check image quality**: Blur, low resolution, or poor contrast affect accuracy
- **Ensure text is horizontal**: Tesseract works best with upright text
- **Try preprocessing**: Increase contrast, reduce noise externally first

### Build fails with TypeScript errors
- **Clear cache**: `rm -rf node_modules dist && npm install`
- **Check Node version**: Requires Node 18+
- **Verify dependencies**: `npm audit fix`

### Decryption fails
- **Wrong password**: Most common cause
- **Tampered image**: Check SHA-256 hash
- **Mismatched files**: Ensure image + key file from same encryption
- **Corrupted file**: Re-download original files

### Slow performance
- **Reduce image size**: Downscale before upload
- **Use modern browser**: Chrome/Edge perform best
- **Close other tabs**: OCR is CPU-intensive
- **Try manual regions**: Skip OCR, draw regions manually

---

## Roadmap

- [ ] **PDF support**: Encrypt regions in PDF documents
- [ ] **Batch processing**: Process multiple images at once
- [ ] **Cloud AI option**: Optional cloud-based detection (Google Vision, AWS Textract)
- [ ] **Region editing**: Resize/adjust detected regions
- [ ] **Keyboard shortcuts**: Power-user navigation
- [ ] **Mobile app**: React Native version
- [ ] **API authentication**: JWT tokens for production deployments
- [ ] **Audit logging**: Track encryption/decryption events

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- **Code style**: Follow existing conventions (Prettier + ESLint)
- **Type safety**: Use TypeScript, avoid `any`
- **Comments**: Document non-obvious logic
- **Tests**: Add tests for new features
- **Security**: Never log passwords or keys

---

## License

MIT License - see LICENSE file for details

---

## Acknowledgments

- **Tesseract.js**: OCR engine
- **Jimp**: Image processing
- **Express**: Web server
- **React**: UI framework
- **Vite**: Build tool
- **Shadcn/ui**: UI components

---

## Security Disclosure

Found a security vulnerability? Please email: security@example.com

**Do NOT** open public GitHub issues for security problems.

---

## Citation

If you use this in research, please cite:

```bibtex
@software{chaoticshield2026,
  title={ChaoticShield: Hybrid Chaotic Image Encryption with AI-Powered Selective Protection},
  author={Your Team},
  year={2026},
  url={https://github.com/yourusername/chaoticshield}
}
```

---

**Built with ❤️ for privacy and security**
