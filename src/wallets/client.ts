import axios from "axios";

/**
 * The /positions endpoint requires a wallet address rather than a
 * market id, so we cannot list top holders that way. Instead we fall
 * back to per-market trade activity: data-api's /activity feed and
 * the CLOB's /trades feed. Both are public (no auth required), so
 * the API key is irrelevant here.
 */
const CANDIDATE_URLS: ReadonlyArray<string> = [
  "https://data-api.polymarket.com/activity",
  "https://clob.polymarket.com/trades",
];

export interface ActivityAttempt {
  url: string;
  status: number;
  ok: boolean;
  body: string;
  errorMessage?: string;
}

export interface ActivityResult {
  attempts: ActivityAttempt[];
  data: unknown | null;
  winningUrl: string | null;
}

export async function fetchMarketActivity(
  conditionId: string,
  limit = 20
): Promise<ActivityResult> {
  const attempts: ActivityAttempt[] = [];
  let firstOk: { data: unknown; url: string } | null = null;

  for (const baseUrl of CANDIDATE_URLS) {
    const params = { market: conditionId, limit };
    const fullUrl = axios.getUri({ url: baseUrl, params });

    try {
      const res = await axios.get(baseUrl, {
        params,
        headers: { Accept: "application/json" },
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
      attempts.push({ url: fullUrl, status: res.status, ok, body });

      if (ok && !firstOk) {
        let parsed: unknown = body;
        try {
          parsed = JSON.parse(body);
        } catch {
          // leave as raw string
        }
        firstOk = { data: parsed, url: fullUrl };
      }
    } catch (err) {
      attempts.push({
        url: fullUrl,
        status: 0,
        ok: false,
        body: "",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    attempts,
    data: firstOk?.data ?? null,
    winningUrl: firstOk?.url ?? null,
  };
}
