import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { FolderClock, FolderOpen, KeyRound, Lock, LockOpen, LogIn, UserPlus } from "lucide-react";
import Folder from "@/components/react-bits/Folder/Folder";
import { SectionHeading } from "@/components/SectionHeading";
import { useAuth } from "@/lib/auth";

type Sub = "cipher" | "key" | "recovered";

const SUB_META: Record<Sub, { label: string; icon: typeof Lock; desc: string }> = {
  cipher: { label: "CIPHER", icon: Lock, desc: "Encrypted images" },
  key: { label: "KEY", icon: KeyRound, desc: "JSON key files" },
  recovered: { label: "RECOVERED", icon: LockOpen, desc: "Decrypted images" },
};

// one labeled page popping out of the single History folder
function SubPaper({
  sub,
  count,
  onEnter,
}: {
  sub: Sub;
  count: number | null;
  onEnter: () => void;
}) {
  const M = SUB_META[sub];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onEnter();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          onEnter();
        }
      }}
      title={`Open ${M.label} sub-folder`}
      className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-[10px] border border-black/10 bg-gradient-to-b from-white to-[#f3ecd9] text-center shadow-[inset 0 1px 0 rgba(255,255,255,0.7)] transition-transform duration-150 hover:scale-[1.04]"
    >
      <M.icon className="h-3.5 w-3.5 text-black/60" />
      <span className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-black/75">{M.label}</span>
      <span className="font-mono text-[7px] text-black/45">{count ?? "sample"}</span>
    </div>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { openAuth } = useOutletContext<{ openAuth: (mode?: "login" | "signup") => void }>();
  const { username, ready, authFetch } = useAuth();
  const [counts, setCounts] = useState<Record<Sub, { count: number; newest: string | null }> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/history/counts");
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts);
      }
    } catch {
      /* counts are best-effort */
    }
  }, [authFetch]);

  useEffect(() => {
    if (username) load();
  }, [username, load]);

  useEffect(() => {
    const handler = () => username && load();
    window.addEventListener("chaoticshield:history", handler);
    return () => window.removeEventListener("chaoticshield:history", handler);
  }, [username, load]);

  const signedOut = ready && !username;
  const count = (s: Sub) => (signedOut ? null : counts ? counts[s].count : 0);
  const enter = (sub: Sub) => {
    if (signedOut) {
      openAuth("login");
      return;
    }
    navigate(`/history/browse/${sub}`);
  };

  const total = counts ? counts.cipher.count + counts.key.count + counts.recovered.count : null;

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        eyebrow="History"
        title="Your encryption archive"
        sub={
          signedOut
            ? "One archive, three sub-folders. Click the folder open — CIPHER, KEY and RECOVERED fan out. Sign in to open yours."
            : "One archive, three sub-folders. Click the folder open and pick a sub-folder to browse it like a file manager."
        }
      />

      {signedOut && (
        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-gold-500/25 bg-gold-500/5 px-6 py-5 sm:flex-row">
          <p className="text-sm text-stone-300">
            <span className="font-semibold text-gold-300">Sign in to browse your archive.</span>{" "}
            <span className="text-stone-400">Everything you encrypt gets filed here automatically.</span>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => openAuth("login")}
              className="flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-5 text-sm font-semibold text-coal-950 shadow-gold-sm transition-all hover:brightness-110"
            >
              <LogIn className="h-4 w-4" /> Sign in
            </button>
            <button
              onClick={() => openAuth("signup")}
              className="flex h-10 items-center gap-1.5 rounded-full border border-gold-500/40 bg-coal-950/60 px-5 text-sm font-semibold text-gold-300 transition-colors hover:border-gold-400 hover:bg-coal-900"
            >
              <UserPlus className="h-4 w-4" /> Sign up
            </button>
          </div>
        </div>
      )}

      {!ready ? (
        <div className="mt-10 flex items-center justify-center gap-2 py-14 text-sm text-stone-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-700 border-t-gold-400" />
          Loading…
        </div>
      ) : (
        <div className="mt-24 flex flex-col items-center pb-32">
          {/* THE ONE HISTORY FOLDER — three pages pop out of it */}
          <div className="relative">
            <Folder
              color="#d4af37"
              size={1.35}
              items={[
                <SubPaper key="c" sub="cipher" count={count("cipher")} onEnter={() => enter("cipher")} />,
                <SubPaper key="k" sub="key" count={count("key")} onEnter={() => enter("key")} />,
                <SubPaper key="r" sub="recovered" count={count("recovered")} onEnter={() => enter("recovered")} />,
              ]}
            />

          </div>

          <p className="mt-6 flex items-center gap-2 text-sm font-semibold tracking-wide text-stone-300">
            <FolderOpen className="h-4 w-4 text-gold-400" />
            HISTORY
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            {signedOut ? "Your encryption archive" : `${total ?? 0} file${total === 1 ? "" : "s"} archived`}
          </p>
          {!signedOut && (
            <button
              onClick={() => navigate("/history/browse/cipher")}
              className="mt-4 rounded-full border border-gold-500/40 bg-coal-950/60 px-5 py-2 text-xs font-semibold text-gold-300 transition-colors hover:border-gold-400 hover:bg-coal-900"
            >
              Open in file manager
            </button>
          )}

          {signedOut && (
            <div className="mt-8 grid grid-cols-3 gap-3 text-center text-[10px] uppercase tracking-widest text-stone-600">
              <span>Cipher</span>
              <span>Key</span>
              <span>Recovered</span>
            </div>
          )}
        </div>
      )}

      {username && counts && total === 0 && (
        <div className="bg-noise -mt-16 flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-800 bg-coal-900/30 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/5">
            <FolderClock className="h-5 w-5 text-gold-500/60" />
          </div>
          <p className="mt-3 text-sm text-stone-500">
            Archive is empty — encrypt an image in the workspace and it will be filed under Cipher + Key.
          </p>
          <Link to="/encrypt" className="mt-3 text-sm text-gold-400 hover:underline">
            Go to the workspace
          </Link>
        </div>
      )}
    </div>
  );
}
