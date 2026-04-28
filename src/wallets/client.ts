import axios from "axios";

/**
 * The /positions endpoint URL is unsettled, so we probe both known
 * hosts with both auth modes and keep going regardless of which
 * succeed -- the caller wants to see the status and body of every
 * attempt, not just the first 2xx. Whichever attempt comes back with
 * a 2xx first is reported as the "winning" endpoint, but that does
 * not short-circuit the remaining probes.
 */
const CANDIDATE_URLS: ReadonlyArray<string> = [
  "https://clob.polymarket.com/positions",
  "https://data-api.polymarket.com/positions",
];

export type AuthMode = "none" | "bearer";

export interface PositionsAttempt {
  url: string;
  authMode: AuthMode;
  status: number;
  ok: boolean;
  body: string;
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
  let firstOk: { data: unknown; url: string; authMode: AuthMode } | null = null;

  for (const baseUrl of CANDIDATE_URLS) {
    for (const authMode of ["none", "bearer"] as AuthMode[]) {
      const params = { market: conditionId, limit };
      const fullUrl = axios.getUri({ url: baseUrl, params });

      // Bearer attempt without a key would just send an unauthenticated
      // request -- record an explicit skip rather than a misleading attempt.
      if (authMode === "bearer" && !apiKey) {
        attempts.push({
          url: fullUrl,
          authMode,
          status: 0,
          ok: false,
          body: "",
          errorMessage: "POLYMARKET_API_KEY not set; bearer attempt skipped",
        });
        continue;
      }

      const headers: Record<string, string> = { Accept: "application/json" };
      if (authMode === "bearer" && apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      try {
        const res = await axios.get(baseUrl, {
          params,
          headers,
          timeout: 15_000,
          validateStatus: () => true,
          // Identity transform so res.data is the raw string body and we
          // can slice it for display regardless of content-type.
          transformResponse: [(data: unknown) => data],
        });
        const body =
          typeof res.data === "string"
            ? res.data
            : res.data === undefined || res.data === null
            ? ""
            : JSON.stringify(res.data);
        const ok = res.status >= 200 && res.status < 300;
        attempts.push({ url: fullUrl, authMode, status: res.status, ok, body });

        if (ok && !firstOk) {
          let parsed: unknown = body;
          try {
            parsed = JSON.parse(body);
          } catch {
            // leave as raw string
          }
          firstOk = { data: parsed, url: fullUrl, authMode };
        }
      } catch (err) {
        attempts.push({
          url: fullUrl,
          authMode,
          status: 0,
          ok: false,
          body: "",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    attempts,
    data: firstOk?.data ?? null,
    winningUrl: firstOk?.url ?? null,
    winningAuthMode: firstOk?.authMode ?? null,
  };
}
