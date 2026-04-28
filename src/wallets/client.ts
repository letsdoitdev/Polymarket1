import axios from "axios";

const CLOB_BASE_URL = "https://clob.polymarket.com";

/**
 * Fetch the top N positions for a market from the Polymarket CLOB API.
 * The market identifier expected here is the on-chain conditionId
 * (the 0x... hex string), not the Gamma numeric id.
 *
 * Returns the response body untyped so we can inspect the actual shape
 * before committing to a WalletPosition schema.
 */
export async function fetchPositions(
  conditionId: string,
  apiKey: string,
  limit = 20
): Promise<unknown> {
  const response = await axios.get(`${CLOB_BASE_URL}/positions`, {
    params: { market: conditionId, limit },
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    timeout: 15_000,
  });
  return response.data;
}
