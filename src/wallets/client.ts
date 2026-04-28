import axios from "axios";

/**
 * Candidate /positions endpoints, ordered by likelihood. Each is tried
 * twice -- once without an Authorization header (the endpoint may be
 * public) and once with the Bearer token if a POLYMARKET_API_KEY is
 * available. The first 2xx response wins.
 */
const CANDIDATES: ReadonlyArray<{
  build: (conditionId: string, limit: number) => { url: string; params?: Record<string, unknown> };
}> = [
  {
    build: (c, l) => ({
      url: `https://clob.polymarket.com/markets/${c}/positions`,
      params: { limit: l },
    }),
  },
  {
    build: (c, l) => ({
      url: `https://data-api.polymarket.com/positions`,
      params: { market: c, limit: l },
    }),
  },
  {
    build: (c, l) => ({
      url: `https://gamma-api.polymarket.com/positions`,
      params: { market: c, limit: l },
    }),
  },
];

export type AuthMode = "none" | "bearer";

export interface PositionsAttempt {
  url: string;
  authMode: AuthMode;
  status: number;
  ok: boolean;
  errorMessage?: string;
}

export interface PositionsResult {
  attempts: PositionsAttempt[];
  data: unknown | null;
  winningUrl: string | null;
  winningAuthMode: AuthMode | null;
}

export async function fetchPositions(
  conditionId: string,
  apiKey: string | undefined,
  limit = 20
): Promise<PositionsResult> {
  const attempts: PositionsAttempt[] = [];
  const authModes: AuthMode[] = apiKey ? ["none", "bearer"] : ["none"];

  for (const cand of CANDIDATES) {
    const { url, params } = cand.build(conditionId, limit);
    const fullUrl = axios.getUri({ url, params });

    for (const authMode of authModes) {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (authMode === "bearer" && apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      try {
        const res = await axios.get(url, {
          params,
          headers,
          timeout: 15_000,
          validateStatus: () => true,
        });
        const ok = res.status >= 200 && res.status < 300;
        attempts.push({ url: fullUrl, authMode, status: res.status, ok });
        if (ok) {
          return {
            attempts,
            data: res.data,
            winningUrl: fullUrl,
            winningAuthMode: authMode,
          };
        }
      } catch (err) {
        attempts.push({
          url: fullUrl,
          authMode,
          status: 0,
          ok: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { attempts, data: null, winningUrl: null, winningAuthMode: null };
}
