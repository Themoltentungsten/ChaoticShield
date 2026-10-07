import CircularText from "@/components/react-bits/CircularText/CircularText";
import LogoLoop from "@/components/react-bits/LogoLoop/LogoLoop";
import { techLogos } from "@/components/react-bits/LogoLoop/techLogos";
export function Footer() {
  return (
    <footer className="relative bg-coal-950 pb-32 pt-10">
      {/* tech-stack logo marquee — replaces the old gold divider line */}
      <div className="text-stone-500">
        <LogoLoop
          logos={techLogos}
          speed={60}
          logoHeight={22}
          gap={56}
          fadeOut
          fadeOutColor="#0b0906"
          scaleOnHover
          ariaLabel="Built with"
          className="py-3"
        />
      </div>

      {/* logo with rotating CHAOTIC SHIELD text */}
      <div className="mx-auto mt-8 flex max-w-[92vw] justify-center px-3 sm:px-6 lg:max-w-[96vw] lg:px-8 xl:max-w-[98vw]">
        <CircularText
          text="CHAOTIC SHIELD"
          separator=" * "
          distance={56}
          spinDuration={16}
          spinDurationHover={5}
          textClassName="font-display text-[10px] text-gold-400/90"
        >
          <img src="/favicon.png" alt="ChaoticShield" className="h-14 w-14 object-contain" />
        </CircularText>
      </div>

      <div className="mx-auto mt-10 grid max-w-[92vw] gap-10 px-3 sm:px-6 md:grid-cols-3 md:items-start lg:max-w-[96vw] lg:px-8 xl:max-w-[98vw]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400/90">About</p>
          <p className="mt-4 text-xs leading-relaxed text-stone-500">
            Image encryption and decryption using a hybrid chaotic approach with
            AI-based parameter selection. Confusion by the Arnold Cat Map, diffusion
            by a Logistic-Map keystream, optional AES-256-GCM second layer, and a
            SHA-256 integrity tag on every cipher.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400/90">Pipeline</p>
          <ul className="mt-4 space-y-2 font-mono text-[11px] leading-relaxed text-stone-500">
            <li>[x′ y′]ᵀ = [[1,1],[1,2]] · [x y]ᵀ mod N (square)</li>
            <li>chaotic Fisher–Yates shuffle (rectangular)</li>
            <li>xₙ₊₁ = r · xₙ · (1 − xₙ), r = 3.99</li>
            <li>C[i] = P[i] ⊕ K[i] ⊕ C[i−1] (×2 passes, RGB)</li>
            <li>exact per-round inverse → lossless recovery</li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400/90">Credits</p>
          <p className="mt-4 text-xs leading-relaxed text-stone-500">
            Built from the major-project report by Yash Kumar Raut, Rishu Mehta and
            Suman Kumar, under the supervision of Dr. Sampa Sahoo — Department of
            Computer Science and Engineering, C.V. Raman Global University,
            Bhubaneswar, Odisha.
          </p>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-[92vw] px-3 sm:px-6 lg:max-w-[96vw] lg:px-8 xl:max-w-[98vw]">
        <div className="gold-ring-divider opacity-50" />
        <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-600">
          For education and research. Chaotic ciphers are fast and strong against statistical
          attacks; protect the key file like a password.
        </p>
      </div>
    </footer>
  );
}
