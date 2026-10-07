// File a run into the signed-in user's History/{cipher,key,recovered} archive,
// then notify the History section to refresh.
export interface HistoryPayload {
  type: "encrypt" | "decrypt";
  summary: string;
  detail?: Record<string, unknown>;
  keyFile?: Record<string, unknown>;
  cipherImage?: string; // data:image/png;base64,...
  recoveredImage?: string; // data:image/png;base64,...
}

export async function saveHistoryRecord(
  authFetch: (url: string, init?: RequestInit) => Promise<Response>,
  record: HistoryPayload,
) {
  try {
    const res = await authFetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (res.ok) window.dispatchEvent(new CustomEvent("chaoticshield:history"));
  } catch {
    // history is best-effort; never block the main flow
  }
}
