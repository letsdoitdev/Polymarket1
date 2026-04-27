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
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  volume: number;
  liquidity: number;
  endDate: string;
  resolvesInDays: number;
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
  bestBid?: string | number;
  bestAsk?: string | number;
  lastTradePrice?: string | number;
  endDate?: string;
  endDateIso?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  acceptingOrders?: boolean;
}

export interface ScoreResult {
  passed: boolean;
  reasons: string[];
}
