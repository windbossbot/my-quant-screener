export interface CryptoData {
  market: string;
  korean_name: string;
  english_name: string;
  price: number;
  change: number;
  volume: number;
}

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLinePoint {
  time: number;
  value: number;
}

export interface ChartFrameData {
  candles: ChartCandle[];
  movingAverages: Record<string, ChartLinePoint[]>;
}

export interface AssetChartData {
  market: string;
  symbol: string;
  generatedAt: number;
  daily: ChartFrameData;
  fourHour: ChartFrameData;
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
