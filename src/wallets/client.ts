import axios from "axios";
import { RawHoldersResponse, RawTrade } from "./types";

const DATA_API_BASE = "https://data-api.polymarket.com";

/**
 * Top holders per outcome token for a given market. The response is an
 * array with one entry per outcome token (YES + NO for binary markets);
 * each entry contains a `holders` array sorted by size descending.
 *
 * Endpoint is public -- no auth header.
 */
export async function fetchHolders(
  conditionId: string,
  limit = 20
): Promise<RawHoldersResponse[]> {
  const res = await axios.get<RawHoldersResponse[]>(
    `${DATA_API_BASE}/holders`,
    {
      params: { market: conditionId, limit },
      timeout: 15_000,
      headers: { Accept: "application/json" },
    }
  );
  if (!Array.isArray(res.data)) {
    throw new Error("Unexpected /holders response shape (expected array)");
  }
  return res.data;
}

/**
 * Recent trades for a given market, newest first. Public endpoint.
 */
export async function fetchTrades(
  conditionId: string,
  limit = 20
): Promise<RawTrade[]> {
  const res = await axios.get<RawTrade[]>(`${DATA_API_BASE}/trades`, {
    params: { market: conditionId, limit },
    timeout: 15_000,
    headers: { Accept: "application/json" },
  });
  if (!Array.isArray(res.data)) {
    throw new Error("Unexpected /trades response shape (expected array)");
  }
  return res.data;
}
