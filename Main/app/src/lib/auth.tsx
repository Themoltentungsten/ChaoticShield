import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";

interface AuthState {
  username: string | null;
  token: string | null;
  ready: boolean;
  signIn: (token: string, username: string) => void;
  signOut: () => void;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState>({
  username: null,
  token: null,
  ready: false,
  signIn: () => {},
  signOut: () => {},
  authFetch: fetch,
});

const TOKEN_KEY = "chaoticshield.token";
const USER_KEY = "chaoticshield.username";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY);
    if (t && u) {
      // validate the stored session before trusting it
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          setToken(t);
          setUsername(d.username);
        })
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const signIn = useCallback((t: string, u: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, u);
    setToken(t);
    setUsername(u);
  }, []);

  const signOut = useCallback(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  const authFetch = useCallback(
    (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers });
    },
    [token],
  );

  const value = useMemo(
    () => ({ username, token, ready, signIn, signOut, authFetch }),
    [username, token, ready, signIn, signOut, authFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Downscale a data-URL image to a small thumbnail data-URL (for history cards).
export function makeThumb(dataUrl: string, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(size / img.width, size / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
