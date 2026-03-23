export interface CryptoData {
  market: string;
  korean_name: string;
  english_name: string;
  price: number;
  change: number;
  volume: number;
}

export type CachedConditionData = {
  data: CryptoData[];
  lastUpdated: string;
};

export type SortDirection = "asc" | "desc";

export type SortConfig = {
  key: keyof CryptoData | null;
  direction: SortDirection;
};

export type LoadingState = "idle" | "loading" | "refreshing";
