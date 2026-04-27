import axios from "axios";
import { RawGammaMarket } from "./types";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

export interface FetchMarketsOptions {
  limit?: number;
  active?: boolean;
  closed?: boolean;
}

export async function fetchMarkets(
  options: FetchMarketsOptions = {}
): Promise<RawGammaMarket[]> {
  const { limit = 100, active = true, closed = false } = options;

  const response = await axios.get<RawGammaMarket[]>(
    `${GAMMA_BASE_URL}/markets`,
    {
      params: { active, closed, limit },
      timeout: 15_000,
      headers: { Accept: "application/json" },
    }
  );

  if (!Array.isArray(response.data)) {
    throw new Error(
      `Unexpected Gamma API response shape: ${typeof response.data}`
    );
  }

  return response.data;
}
