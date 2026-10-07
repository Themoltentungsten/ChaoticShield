# ChaoticShield — Project Samjho (Hinglish) 🛡️

> Ek image encryption app jo **chaos theory** (Arnold Cat Map + Logistic Map) aur **AES-256-GCM**
> ko mila ke images ko lossless encrypt/decrypt karta hai, saath mein AI-powered **selective
> (partial) encryption** bhi — matlab sirf sensitive hisse (Aadhaar, phone, signature…) encrypt karo.

---

## 🧱 Tech Stack (ek nazar mein)

| Layer | Technology | Kya karta hai |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite 7 | SPA, saare pages client pe render |
| **UI** | Tailwind CSS + shadcn/ui (Radix) + lucide icons | Dark gold/coal theme, components |
| **3D/Anim** | three.js + React Three Fiber + motion | HomePage ka hero visuals |
| **Charts** | Recharts | Histogram / metrics graphs |
| **Backend** | Node.js + Express 5 (single server) | API + frontend dono ek hi port (7100) pe |
| **Image I/O** | Jimp | PNG/JPEG decode-encode, lossless, native resolution |
| **Crypto** | Node.js `crypto` | AES-256-GCM, PBKDF2-SHA-512, SHA-256 |
| **AI Detection** | Google Gemini Vision (`gemini-3.7-flash`) | Document mein PII regions (bbox) detect karna |
| **Database** | `node:sqlite` (built-in) | Users, tokens, history records |
| **File Upload** | Multer (memory storage) | Image/key file uploads handle |

---

## ⚙️ Kaise Kaam Karta Hai

### 1️⃣ Full Image Encryption (`/encrypt`)

Pipeline 8 phases mein chalta hai (SSE stream se live "thinking" dikhti hai):

1. **Input decoding** — image native resolution pe RGB mein decode hoti hai (koi resize/grayscale nahi, isliye lossless).
2. **Feature analysis** — Shannon entropy, Sobel edge density, size nikala jata hai.
3. **AI parameter selection** — decision tree features dekh ke rounds (`k`), seed (`x₀`), logistic `r`, aur AES on/off choose karta hai. Manual override bhi possible.
4. **Confusion (permutation)** — square image → Arnold Cat Map `(x+y, x+2y) mod N`; rectangular → chaotic Fisher–Yates shuffle. Pixels idhar-udhar bikharte hain.
5. **Diffusion (keystream)** — logistic map `x(n+1) = r·x(n)·(1−x(n))` se keystream ban ke do XOR passes (forward + backward) — ek bit badlo toh poora cipher badal jata hai (avalanche).
6. **Optional AES-256-GCM layer** — cipher bytes pe ek aur authenticated encryption layer.
7. **Integrity tag** — final cipher ka SHA-256 hash key file mein store.
8. **Self-test + metrics** — in-memory round-trip (lossless proof), phir NPCR, UACI, entropy, correlation measure.

**Output:** encrypted PNG + ek JSON **key file** (rounds, seed, r, hash, AES iv/tag). Key file ke bina decryption impossible.

### 2️⃣ Decryption (`/decrypt`)

Key file + cipher image upload → pehle **SHA-256 integrity verify** (mismatch toh abort),
phir AES unwrap (agar enabled), phir inverse diffusion + inverse permutation
(cat map ka exact inverse ya shuffle list reverse). Result = **bit-identical original** (PSNR = ∞).

### 3️⃣ Selective Encryption (`/selective`) — AI wala hissa

1. **Scan** — image server ke through Gemini Vision ko jati hai; model sensitive cheezein
   (phone, email, Aadhaar, PAN, signature, QR code…) ke bounding boxes return karta hai.
   Har box validate/clamp/dedupe hota hai — hallucinated boxes drop ho jate hain.
2. **Review** — canvas pe colored boxes dikhte hain; select/deselect karo ya manually draw karo.
3. **Encrypt** — sirf selected regions ke pixels **AES-256-GCM** se encrypt (per-region random IV);
   key = PBKDF2-SHA-512 (100k iterations) from password. Baaki image untouched rehti hai.
4. **Decrypt** (`/selective/decrypt`) — encrypted image + key file + password → original pixels wapas.

### 4️⃣ Auth + History (`/history`)

- Signup/login (PBKDF2 password hashing, bearer tokens) — sab SQLite mein.
- Har encrypt/decrypt pe cipher, key, aur recovered images automatically user ke
  `History/{cipher, key, recovered}` archive mein save (signed-in users ke liye).

---

## 🔐 Security Highlights

- **Lossless** — PNG round-trip, decrypt = exact original bytes
- **Key-space** — chaotic params + plain-image SHA-256 se derived seeds (har image ka keystream unique)
- **Tamper detection** — SHA-256 tag (full) + AES-GCM auth tags (per region)
- **Password kahi store nahi hota** — sirf KDF salt key file mein

## 📊 Quality Metrics (encrypt ke baad dikhte hain)

| Metric | Ideal | Matlab |
|---|---|---|
| Entropy | 8.0 | Cipher kitna random hai |
| Correlation | ~0 | Adjacent pixels ka relation toot gaya |
| NPCR | 99.61% | 1-bit change se kitne pixels badle |
| UACI | 33.46% | Change ki average intensity |
| PSNR (self-test) | ∞ | Lossless proof |

## 🚀 Run Kaise Karein

```bash
cd Main/app
npm install
npm run dev          # dev (Vite HMR) → http://localhost:7100
# ya production:
npm run build && npm start
```

Config `.env` mein: `PORT`, `HOST`, `GEMINI_API_KEY`, `GEMINI_MODEL`
(selective scan ke liye Gemini key zaroori hai).

---

*ChaoticShield — chaos + cryptography, ek clean UI mein.* ✨