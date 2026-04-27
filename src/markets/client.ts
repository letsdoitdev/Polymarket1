import axios from "axios";
import { RawGammaMarket } from "./types";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

export interface FetchMarketsOptions {
  limit?: number;
  active?: boolean;
  closed?: boolean;
  endDateMax?: Date;
}

function isoUtc(d: Date): string {
  return d.toISOString();
}

export async function fetchMarkets(
  options: FetchMarketsOptions = {}
): Promise<RawGammaMarket[]> {
  const {
    limit = 200,
    active = true,
    closed = false,
    endDateMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  } = options;

  const response = await axios.get<RawGammaMarket[]>(
    `${GAMMA_BASE_URL}/markets`,
    {
      params: {
        active,
        closed,
        limit,
        end_date_max: isoUtc(endDateMax),
      },
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
