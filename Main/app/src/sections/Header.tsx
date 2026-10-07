import { useLocation, useNavigate } from "react-router";
import { LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import StickerPeel from "@/components/react-bits/StickerPeel/StickerPeel";

const NAV = [
  { label: "Home", path: "/" },
  { label: "Methodology", path: "/methodology" },
  { label: "Encrypt", path: "/encrypt" },
  { label: "Selective", path: "/selective" },
  { label: "Decrypt", path: "/decrypt" },
  { label: "History", path: "/history" },
  { label: "Team", path: "/team" },
];

export function Header({ onAuthClick }: { onAuthClick: () => void }) {
  const { username, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-gold-500/10 bg-coal-950/75 shadow-[0_1px_0_0_rgba(212,175,55,0.06)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[92vw] items-center justify-between px-3 sm:h-16 sm:px-6 lg:max-w-[96vw] lg:px-8 xl:max-w-[98vw]">
        <button
          onClick={() => navigate("/")}
          className="group flex items-center gap-2 sm:gap-2.5"
          aria-label="Home"
        >
          <StickerPeel
            imageSrc="/favicon.png"
            alt="ChaoticShield"
            width={46}
            padding={6}
            peelBackHoverPct={32}
            peelDirection={180}
            shadowIntensity={0.35}
            lightingIntensity={0.12}
            className="shrink-0"
          />
          <span className="hidden font-display text-[15px] font-bold tracking-[0.02em] text-stone-100 sm:inline">
            Chaotic<span className="text-gold-gradient">Shield</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                pathname === n.path
                  ? "bg-gold-400/12 text-gold-300 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.25)]"
                  : "text-stone-400 hover:bg-gold-500/10 hover:text-gold-300",
              )}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {username ? (
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-full border border-gold-500/25 bg-coal-900/80 px-3.5 py-1.5 text-xs text-stone-200 transition-colors hover:border-gold-500/50 hover:bg-coal-800"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            <User className="h-3.5 w-3.5 text-gold-400" />
            {username}
            <LogOut className="h-3.5 w-3.5 text-stone-500" />
          </button>
        ) : (
          <button
            onClick={onAuthClick}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-4 py-1.5 text-xs font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
