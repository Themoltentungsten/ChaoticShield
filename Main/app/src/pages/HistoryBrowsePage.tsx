import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Download,
  FileJson,
  Folder,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

type Sub = "cipher" | "key" | "recovered";

interface HistoryFile {
  id: string;
  folder: Sub;
  name: string;
  kind: "png" | "json";
  size: number;
  meta: Record<string, unknown>;
  src: string | null;
  content: string | null;
  createdAt: string;
}

const SUB_META: Record<Sub, { label: string; icon: typeof Lock; type: string; empty: string }> = {
  cipher: { label: "Cipher", icon: Lock, type: "Cipher", empty: "Nothing in Cipher yet. Encrypt an image in the workspace and the cipher lands here automatically." },
  key: { label: "Key", icon: KeyRound, type: "JSON", empty: "Nothing in Key yet. Every run saves its key file here." },
  recovered: { label: "Recovered", icon: LockOpen, type: "Image", empty: "Nothing in Recovered yet. Decrypt a cipher in the workspace and the recovered image lands here." },
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fmtSize = (n: number) => {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

export default function HistoryBrowsePage() {
  const { folder: folderParam = "cipher" } = useParams();
  const folder = (["cipher", "key", "recovered"].includes(folderParam) ? folderParam : "cipher") as Sub;
  const M = SUB_META[folder];
  const navigate = useNavigate();
  const { authFetch, token } = useAuth();

  const [files, setFiles] = useState<HistoryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // thumbnails/preview served through the authenticated endpoint; attach the
  // token so <img> tags resolve (a bare request would 401 and look "missing")
  const authSrc = useCallback(
    (s: string | null) => (s && token ? `${s}${s.includes("?") ? "&" : "?"}token=${token}` : s),
    [token],
  );

  // context menu (custom, File-Explorer style)
  const [menu, setMenu] = useState<{ x: number; y: number; file: HistoryFile } | null>(null);
  // dialogs
  const [opening, setOpening] = useState<HistoryFile | null>(null);
  const [renaming, setRenaming] = useState<HistoryFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HistoryFile | null>(null);
  const [properties, setProperties] = useState<HistoryFile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/history/files?folder=${folder}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Could not load files");
      const data = await res.json();
      setFiles(
        (data.files as HistoryFile[]).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load files");
    } finally {
      setLoading(false);
    }
  }, [authFetch, folder]);

  useEffect(() => {
    load();
  }, [load]);

  // real-time sync with SQLite: reload when a run files something (event),
  // and poll every 5s so edits from any other tab/user land immediately.
  useEffect(() => {
    const silentLoad = async () => {
      try {
        const res = await authFetch(`/api/history/files?folder=${folder}`);
        if (!res.ok) return;
        const data = await res.json();
        setFiles((data.files as HistoryFile[]).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      } catch {
        /* transient errors are fine during background sync */
      }
    };
    const onHistory = () => silentLoad();
    const timer = setInterval(silentLoad, 5000);
    window.addEventListener("chaoticshield:history", onHistory);
    return () => {
      clearInterval(timer);
      window.removeEventListener("chaoticshield:history", onHistory);
    };
  }, [authFetch, folder]);

  useEffect(() => {
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // keep the menu pinned inside the viewport
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const { innerWidth, innerHeight } = window;
    const r = el.getBoundingClientRect();
    let x = menu.x;
    let y = menu.y;
    if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
  }, [menu]);

  // downloads go through the auth'd API → the exact bytes stored in the DB,
  // then a blob/object-URL anchor (a bare <a href=/api/...> would 401).
  const download = useCallback(
    async (f: HistoryFile) => {
      try {
        if (f.kind === "json") {
          const blob = new Blob([f.content ?? ""], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          return;
        }
        if (!f.src) return;
        const res = await authFetch(f.src);
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "File is no longer on the server");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) {
        setDialogError(e instanceof Error ? e.message : "Download failed");
      }
    },
    [authFetch],
  );

  const doRename = async () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setDialogError(null);
    try {
      const res = await authFetch(`/api/history/files/${renaming.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Rename failed");
      setFiles((prev) => prev.map((f) => (f.id === renaming.id ? { ...f, name: data.name } : f)));
      setRenaming(null);
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Rename failed");
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDialogError(null);
    try {
      const res = await authFetch(`/api/history/files/${confirmDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Delete failed");
      setFiles((prev) => prev.filter((f) => f.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const thumb = useMemo(() => files.filter((f) => f.kind === "png").slice(0, 3), [files]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* breadcrumb + back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1.5 text-sm text-stone-500">
          <Link to="/history" className="flex items-center gap-1.5 transition-colors hover:text-gold-400">
            <Folder className="h-3.5 w-3.5" /> History
          </Link>
          <span className="text-stone-700">/</span>
          <span className="flex items-center gap-1.5 text-gold-400">
            <M.icon className="h-3.5 w-3.5" /> {M.label}
          </span>
        </nav>
        <Link
          to="/history"
          className="flex items-center gap-1.5 rounded-full border border-stone-800 bg-coal-950/60 px-4 py-1.5 text-xs font-semibold text-stone-400 transition-colors hover:border-gold-500/40 hover:text-gold-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to History
        </Link>
      </div>

      {/* header strip */}
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-stone-800/80 bg-coal-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/10">
            <M.icon className="h-5 w-5 text-gold-400" />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-stone-100">{M.label}</h1>
            <p className="text-[11px] text-stone-500">
              {loading ? "Loading…" : `${files.length} file${files.length === 1 ? "" : "s"} · right-click a file for Open / Rename / Delete / Properties`}
            </p>
          </div>
        </div>
        {/* sub-folder switcher */}
        <div className="flex gap-1.5">
          {(["cipher", "key", "recovered"] as Sub[]).map((s) => (
            <button
              key={s}
              onClick={() => navigate(`/history/browse/${s}`)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                s === folder
                  ? "bg-gradient-to-b from-gold-300 to-gold-500 text-coal-950 shadow-gold-sm"
                  : "border border-stone-800 bg-coal-950/60 text-stone-400 hover:border-gold-500/40 hover:text-gold-300"
              }`}
            >
              {SUB_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div className="mt-4 rounded-2xl border border-stone-800/80 bg-coal-900/30">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-stone-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-700 border-t-gold-400" />
            Listing {M.label}…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-24 text-sm">
            <p className="text-red-400">{error}</p>
            <button onClick={load} className="rounded-full border border-gold-500/40 px-4 py-1.5 text-xs font-semibold text-gold-300 hover:border-gold-400">
              Retry
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            {thumb.length === 0 ? (
              <M.icon className="h-8 w-8 text-stone-700" />
            ) : (
              <div className="flex gap-2">
                {thumb.map((t) => (
                  <img key={t.id} src={authSrc(t.src) ?? ""} alt="" className="h-14 w-14 rounded-lg border border-stone-800 object-cover opacity-60" />
                ))}
              </div>
            )}
            <p className="mt-2 max-w-md text-[13px] text-stone-500">{M.empty}</p>
            <Link to={folder === "recovered" ? "/decrypt" : "/encrypt"} className="mt-2 text-sm text-gold-400 hover:underline">
              Go to the workspace
            </Link>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-800/70 text-[10px] uppercase tracking-[0.16em] text-stone-500">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Type</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Date / Time</th>
                <th className="px-4 py-3 text-right font-semibold">Size</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr
                  key={f.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, file: f });
                  }}
                  onDoubleClick={() => setOpening(f)}
                  className="cursor-default border-b border-stone-800/40 transition-colors last:border-0 hover:bg-coal-800/40"
                >
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      {f.kind === "png" ? (
                        f.src ? (
                          <img src={authSrc(f.src) ?? ""} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md border border-stone-800 object-cover" />
                        ) : (
                          <ImageIcon className="h-9 w-9 shrink-0 text-stone-700" />
                        )
                      ) : (
                        <FileJson className="h-5 w-5 shrink-0 text-gold-500/70" />
                      )}
                      <span className="truncate font-medium text-stone-200" title={f.name}>
                        {f.name}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 text-[12px] text-stone-500 sm:table-cell">{M.type}</td>
                  <td className="hidden px-4 py-2.5 text-[12px] tabular-nums text-stone-500 md:table-cell">{fmtDate(f.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-stone-500">{fmtSize(f.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-stone-600">
        Double-click to open · right-click for Rename / Delete / Properties
      </p>

      {/* file-manager context menu */}
      {menu && (
        <div
          ref={menuRef}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-50 w-44 overflow-hidden rounded-xl border border-stone-700/80 bg-coal-900/95 py-1 shadow-[0_18px_50px_rgba(0,0,0,0.7)] backdrop-blur"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={() => {
              setOpening(menu.file);
              setMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-200 hover:bg-coal-800"
          >
            <LockOpen className="h-3.5 w-3.5 text-stone-400" /> Open
          </button>
          <button
            onClick={() => {
              setRenaming(menu.file);
              setRenameValue(menu.file.name);
              setDialogError(null);
              setMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-200 hover:bg-coal-800"
          >
            <Pencil className="h-3.5 w-3.5 text-stone-400" /> Rename
          </button>
          <button
            onClick={() => {
              setConfirmDelete(menu.file);
              setDialogError(null);
              setMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <div className="my-1 h-px bg-stone-800" />
          <button
            onClick={() => {
              setProperties(menu.file);
              setMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-200 hover:bg-coal-800"
          >
            <FileJson className="h-3.5 w-3.5 text-stone-400" /> Properties
          </button>
        </div>
      )}

      {/* open / preview dialog */}
      <Dialog open={!!opening} onOpenChange={(v) => !v && setOpening(null)}>
        <DialogContent className="flex max-h-[88vh] min-w-0 flex-col overflow-hidden border-gold-500/20 bg-coal-950 text-stone-100 sm:max-w-2xl">
          {opening && (
            <>
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex min-w-0 items-center gap-2 font-display text-base text-stone-100">
                  {opening.kind === "png" && opening.src ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-gold-400" />
                  ) : (
                    <FileJson className="h-4 w-4 shrink-0 text-gold-400" />
                  )}
                  <span className="truncate" title={opening.name}>{opening.name}</span>
                </DialogTitle>
                <p className="truncate text-[11px] text-stone-500">
                  {SUB_META[opening.folder].label} · {fmtSize(opening.size)} · {fmtDate(opening.createdAt)}
                </p>
              </DialogHeader>
              <div className="checkerboard min-h-0 shrink min-w-0 flex-1 overflow-auto rounded-xl border border-stone-800 p-4">
                {opening.kind === "png" ? (
                  opening.src ? (
                    <div className="flex min-h-full items-center justify-center">
                      <img src={authSrc(opening.src) ?? ""} alt={opening.name} className="max-h-[55vh] max-w-full rounded-lg border border-black/40" />
                    </div>
                  ) : (
                    <p className="py-10 text-center text-sm text-stone-500">No preview available.</p>
                  )
                ) : (
                  <pre className="w-fit min-w-full break-words whitespace-pre-wrap rounded-lg bg-coal-950/80 p-4 font-mono text-xs leading-relaxed text-stone-300">
                    {formatJsonPretty(opening.content)}
                  </pre>
                )}
              </div>
              <DialogFooter className="shrink-0 gap-2">
                <Button variant="outline" className="border-stone-700 text-stone-300 hover:bg-coal-800 hover:text-white" onClick={() => setOpening(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => download(opening)}
                  className="bg-gradient-to-b from-gold-300 to-gold-500 text-coal-950 hover:brightness-110"
                >
                  <Download className="mr-1.5 h-4 w-4" /> Download
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent className="border-gold-500/20 bg-coal-950 text-stone-100 sm:max-w-md">
          {renaming && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-display text-base text-stone-100">
                  <Pencil className="h-4 w-4 text-gold-400" /> Rename
                </DialogTitle>
                <p className="truncate text-[11px] text-stone-500" title={renaming.name}>
                  {renaming.name}
                </p>
              </DialogHeader>
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doRename()}
                className="mt-1 rounded-lg border-stone-700 bg-coal-900 text-stone-100"
                placeholder="New filename"
              />
              {dialogError && <p className="mt-2 text-xs text-red-400">{dialogError}</p>}
              <DialogFooter className="gap-2">
                <Button variant="outline" className="border-stone-700 text-stone-300 hover:bg-coal-800 hover:text-white" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={doRename}
                  disabled={!renameValue.trim()}
                  className="bg-gradient-to-b from-gold-300 to-gold-500 text-coal-950 hover:brightness-110 disabled:opacity-50"
                >
                  <Save className="mr-1.5 h-4 w-4" /> Rename
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* delete confirmation — custom modal, fully themed */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-red-500/30 bg-coal-950 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.9)]"
          >
            <div className="border-b border-stone-800/70 px-5 py-4">
              <p className="flex items-center gap-2 font-display text-base font-semibold text-red-400">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                </span>
                Delete permanently?
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] leading-relaxed text-stone-400">
                <span className="font-semibold text-stone-200">“{confirmDelete.name}”</span> will be removed
                from History / {SUB_META[confirmDelete.folder].label}. This action cannot be undone.
              </p>
              {dialogError && (
                <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {dialogError}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="h-9 rounded-full border border-stone-700 bg-coal-900 px-5 text-xs font-semibold text-stone-300 transition-colors hover:border-stone-500 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={doDelete}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-red-600 px-5 text-xs font-semibold text-white shadow-[0_6px_20px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* properties dialog */}
      <Dialog open={!!properties} onOpenChange={(v) => !v && setProperties(null)}>
        <DialogContent className="border-gold-500/20 bg-coal-950 text-stone-100 sm:max-w-md">
          {properties && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-display text-base text-stone-100">
                  <Folder className="h-4 w-4 text-gold-400" /> Properties
                </DialogTitle>
              </DialogHeader>
              <dl className="space-y-2 rounded-xl border border-stone-800 bg-coal-900/50 p-4 font-mono text-[12px] text-stone-300">
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Name</dt>
                  <dd className="max-w-[220px] truncate text-right" title={properties.name}>{properties.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Folder</dt>
                  <dd>History / {SUB_META[properties.folder].label}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Type</dt>
                  <dd>{SUB_META[properties.folder].type}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Size</dt>
                  <dd>{fmtSize(properties.size)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Created</dt>
                  <dd>{fmtDate(properties.createdAt)}</dd>
                </div>
                {typeof properties.meta.rounds === "number" && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500">Rounds</dt>
                    <dd>{String(properties.meta.rounds)}</dd>
                  </div>
                )}
                {properties.meta.seed != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500">x₀</dt>
                    <dd>{String(properties.meta.seed)}</dd>
                  </div>
                )}
                {typeof properties.meta.aes === "boolean" && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500">AES</dt>
                    <dd>{properties.meta.aes ? "on" : "off"}</dd>
                  </div>
                )}
                {properties.meta.width != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500">Dimensions</dt>
                    <dd>{String(properties.meta.width)}×{String(properties.meta.height)}</dd>
                  </div>
                )}
              </dl>
              <DialogFooter>
                <Button variant="outline" className="border-stone-700 text-stone-300 hover:bg-coal-800 hover:text-white" onClick={() => setProperties(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatJsonPretty(raw: string | null) {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
