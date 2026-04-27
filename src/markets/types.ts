export interface WalletPosition {
  address: string;
  size: number;
  side: "YES" | "NO";
}

export interface Market {
  id: string;
  question: string;
  description: string;
  currentYesProbability: number;
  volume: number;
  liquidity: number;
  endDate: string;
  tags: string[];
  topPositions: WalletPosition[];
}

export interface RawGammaMarket {
  id: string;
  question?: string;
  description?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  volume?: string | number;
  volumeNum?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  endDate?: string;
  endDateIso?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  acceptingOrders?: boolean;
  tags?: Array<{ label?: string; slug?: string } | string>;
  events?: Array<{
    tags?: Array<{ label?: string; slug?: string } | string>;
  }>;
}

export interface ScoreResult {
  passed: boolean;
  reasons: string[];
}
