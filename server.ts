import express from "express";
import fs from "fs";
import path from "path";
import {
  ALL_CONDITION_IDS,
  DAILY_CONDITION_IDS,
  FOUR_HOUR_CONDITION_IDS,
  type ConditionId,
} from "./src/config/screenerBootstrap.js";
import { ACTIVE_ENTRY_PROFILE } from "./src/config/entryBootstrap.js";

type ScreenerRow = {
  market: string;
  korean_name: string;
  english_name: string;
  price: number;
  change: number;
  volume: number;
  ma20_d: number | null;
  ma60_d: number | null;
  ma120_d: number | null;
  ma240_d: number | null;
  ma120_m: number | null;
  candle_count_m: number;
};

type ResultsByCondition = Record<ConditionId, ScreenerRow[]>;
type ResultsCache = { generatedAt: number; resultsByCondition: ResultsByCondition };
type LogLevel = "DEBUG" | "INFO" | "ERROR";
type Logger = (level: LogLevel, event: string, details?: Record<string, unknown>) => void;
type MarketMeta = {
  korean_name: string;
  english_name: string;
};
type MarketApiRow = {
  market: string;
  korean_name: string;
  english_name: string;
};
type OrderbookEntry = {
  price: string;
  quantity: string;
};
type TickerEntry = {
  closing_price: string;
  fluctate_rate_24H: string;
  acc_trade_value_24H: string;
};
type TickerApiResponse = {
  status: string;
  data: Record<string, TickerEntry | string>;
};
type CandleApiResponse = {
  status: string;
  data: Array<Array<string | number>>;
};
type OrderbookApiResponse = {
  status: string;
  data: {
    bids: OrderbookEntry[];
  };
};
type BaseSymbolContext = {
  symbol: string;
  currentPrice: number;
  dailyCandles: ChartCandle[];
  dailyPrices: number[];
  weeklyPrices: number[];
  monthlyPrices: number[];
  row: ScreenerRow;
};
type FourHourSymbolContext = {
  currentCandle: ChartCandle;
  currentPrice: number;
  completedCandles: ChartCandle[];
  completedPrices: number[];
  ma20: number | null;
  ma30: number | null;
  ma120: number | null;
  ma240: number | null;
  averageNotionalVolume: number | null;
};
type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
type ChartLinePoint = {
  time: number;
  value: number;
};
type ChartFrameData = {
  candles: ChartCandle[];
  movingAverages: Record<string, ChartLinePoint[]>;
};
type ChartFrameScope = "all" | "daily" | "fourHour";
type ChartFrameState = {
  frame: ChartFrameData | null;
  error: string | null;
  stale: boolean;
  generatedAt: number | null;
};
type AssetChartResponse = {
  market: string;
  symbol: string;
  generatedAt: number;
  daily: ChartFrameState;
  fourHour: ChartFrameState;
};

const projectRoot = process.cwd();
const EXCLUDED_SYMBOLS = new Set(["USDC", "USDT", "USD1", "USDE", "USDS"]);
const LOG_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  ERROR: 30,
};
const CSV_HEADER = "Market,Price,MA20(D),MA60(D),MA120(D),MA240(D),MA120(M),MonthlyCandles\n";
const BITHUMB_API_BASE_URL = "https://api.bithumb.com";
const TICKER_CACHE_TTL_MS = 30 * 1000;
const MARKET_METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CHART_CACHE_TTL_MS = 60 * 1000;
const CHART_MOVING_AVERAGE_PERIODS = [20, 30, 60, 120, 240] as const;
const ACTIVE_ENTRY_EXCLUDED_SYMBOLS = new Set(ACTIVE_ENTRY_PROFILE.excludedSymbols);
const MIN_MONTHLY_CANDLES = 2;
const MIN_FOUR_HOUR_CANDLES = 241;

function loadEnvFile() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createEmptyResults(): ResultsByCondition {
  return Object.fromEntries(
    ALL_CONDITION_IDS.map((conditionId) => [conditionId, [] as ScreenerRow[]]),
  ) as ResultsByCondition;
}

function calculateMA(prices: number[], period: number) {
  if (prices.length < period) {
    return null;
  }

  const sum = prices.slice(-period).reduce((accumulator, price) => accumulator + price, 0);
  return sum / period;
}

function toHigherTimeframePrices(prices: number[], step: number) {
  const groupedPrices: number[] = [];
  for (let index = 0; index < prices.length; index += step) {
    const chunk = prices.slice(index, index + step);
    if (chunk.length > 0) {
      groupedPrices.push(chunk[chunk.length - 1]);
    }
  }
  return groupedPrices;
}

function isBullishAlignment(prices: number[]) {
  const ma20 = calculateMA(prices, 20);
  const ma60 = calculateMA(prices, 60);
  const ma120 = calculateMA(prices, 120);

  if (ma20 === null || ma60 === null) {
    return false;
  }

  if (ma120 === null) {
    return ma20 > ma60;
  }

  return ma20 > ma60 && ma60 > ma120;
}

function isNearDailyMA20(prices: number[], currentPrice: number) {
  const movingAverage = calculateMA(prices, 20);
  return isWithinPercentRange(currentPrice, movingAverage, 5, -5);
}

function isAboveDailyMAThreshold(prices: number[], period: number, currentPrice: number, lowerPercent: number) {
  const movingAverage = calculateMA(prices, period);
  if (movingAverage === null) {
    return false;
  }

  return currentPrice >= movingAverage * (1 + lowerPercent / 100);
}

function isAboveDailyMA(prices: number[], period: number, currentPrice: number) {
  const movingAverage = calculateMA(prices, period);
  if (movingAverage === null) {
    return false;
  }

  return currentPrice >= movingAverage;
}

function isWithinPercentRange(currentPrice: number, movingAverage: number | null, upperPercent: number, lowerPercent: number) {
  if (movingAverage === null) {
    return false;
  }

  const upperLimit = movingAverage * (1 + upperPercent / 100);
  const lowerLimit = movingAverage * (1 + lowerPercent / 100);
  return currentPrice >= lowerLimit && currentPrice <= upperLimit;
}

function matchesFourHourRange(currentPrice: number, shortMa: number | null, longMa: number | null) {
  return (
    isWithinPercentRange(currentPrice, shortMa, 5, -1) &&
    isWithinPercentRange(currentPrice, longMa, 2, -10)
  );
}

function passesCandidateEnvelope(
  currentPrice: number,
  ma20: number | null,
  ma120: number | null,
  ma240: number | null,
) {
  if (ma20 === null) {
    return false;
  }

  const baseCondition =
    currentPrice >= ma20 * 0.99 &&
    currentPrice <= ma20 * ACTIVE_ENTRY_PROFILE.ma20UpperMultiplier;

  if (!baseCondition) {
    return false;
  }

  const ma120Condition =
    ma120 !== null &&
    currentPrice >= ma120 * 0.90 &&
    currentPrice <= ma120 * ACTIVE_ENTRY_PROFILE.longMaUpperMultiplier;

  const ma240Condition =
    ma240 !== null &&
    currentPrice >= ma240 * 0.90 &&
    currentPrice <= ma240 * ACTIVE_ENTRY_PROFILE.longMaUpperMultiplier;

  return ma120Condition || ma240Condition;
}

function passesDailyTouchEntry(candle: ChartCandle, dailyMa20: number) {
  if (ACTIVE_ENTRY_PROFILE.dailyMaEntryTolerancePct <= 0) {
    return candle.low <= dailyMa20 && candle.high >= dailyMa20;
  }

  return (
    candle.close >= dailyMa20 &&
    candle.close <= dailyMa20 * (1 + ACTIVE_ENTRY_PROFILE.dailyMaEntryTolerancePct)
  );
}

function calculateAverageNotionalVolume(candles: ChartCandle[], lookbackBars: number) {
  if (candles.length < lookbackBars || lookbackBars <= 0) {
    return null;
  }

  const recentCandles = candles.slice(-lookbackBars);
  const totalNotional = recentCandles.reduce((sum, candle) => sum + candle.close * candle.volume, 0);
  return totalNotional / lookbackBars;
}

function passesRecentVolumeInflowInclusion(candles: ChartCandle[]) {
  const {
    recentVolumeInflowBaselineDays,
    recentVolumeInflowLookbackDays,
    recentVolumeInflowMinVolumeRatio,
  } = ACTIVE_ENTRY_PROFILE;

  if (
    recentVolumeInflowLookbackDays <= 0 ||
    recentVolumeInflowMinVolumeRatio <= 0 ||
    recentVolumeInflowBaselineDays <= 0
  ) {
    return true;
  }

  if (candles.length <= recentVolumeInflowBaselineDays) {
    return false;
  }

  const windowStart = Math.max(
    candles.length - recentVolumeInflowLookbackDays,
    recentVolumeInflowBaselineDays,
  );

  for (let index = windowStart; index < candles.length; index += 1) {
    const currentCandle = candles[index];
    if (currentCandle.close <= currentCandle.open) {
      continue;
    }

    const baselineWindow = candles.slice(index - recentVolumeInflowBaselineDays, index);
    if (baselineWindow.length === 0) {
      continue;
    }

    const averageVolume =
      baselineWindow.reduce((sum, candle) => sum + candle.volume, 0) / baselineWindow.length;

    if (averageVolume > 0 && currentCandle.volume / averageVolume >= recentVolumeInflowMinVolumeRatio) {
      return true;
    }
  }

  return false;
}

function getTopBidNotional(bids: OrderbookEntry[], depth: number) {
  return bids
    .slice(0, depth)
    .reduce((sum, bid) => sum + Number(bid.price) * Number(bid.quantity), 0);
}

function calculateRSI(prices: number[], period = 14) {
  if (prices.length < period + 1) {
    return null;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = prices[index] - prices[index - 1];
    if (change > 0) {
      gainSum += change;
    } else {
      lossSum += -change;
    }
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  for (let index = period + 1; index < prices.length; index += 1) {
    const change = prices[index] - prices[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function normalizeCandles(candles: Array<Array<string | number>>): ChartCandle[] {
  return candles
    .map((candle) => ({
      time: Math.floor(Number(candle[0]) / 1000),
      open: Number(candle[1]),
      close: Number(candle[2]),
      high: Number(candle[3]),
      low: Number(candle[4]),
      volume: Number(candle[5] ?? 0),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.volume),
    )
    .sort((left, right) => left.time - right.time);
}

function aggregateCandles(candles: ChartCandle[], step: number) {
  const aggregatedCandles: ChartCandle[] = [];

  for (let index = 0; index < candles.length; index += step) {
    const chunk = candles.slice(index, index + step);
    if (chunk.length === 0) {
      continue;
    }

    // Keep 4-hour grouping aligned with the screener logic that builds higher timeframes
    // by consuming the lower timeframe data in fixed-size chronological chunks.
    aggregatedCandles.push({
      time: chunk[chunk.length - 1].time,
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high: Math.max(...chunk.map((candle) => candle.high)),
      low: Math.min(...chunk.map((candle) => candle.low)),
      volume: chunk.reduce((sum, candle) => sum + candle.volume, 0),
    });
  }

  return aggregatedCandles;
}

function createMovingAverageLine(candles: ChartCandle[], period: number) {
  const linePoints: ChartLinePoint[] = [];

  for (let index = period - 1; index < candles.length; index += 1) {
    const closePrices = candles.slice(index - period + 1, index + 1).map((candle) => candle.close);
    linePoints.push({
      time: candles[index].time,
      value: closePrices.reduce((sum, price) => sum + price, 0) / period,
    });
  }

  return linePoints;
}

function createChartFrame(candles: ChartCandle[]): ChartFrameData {
  const movingAverages = Object.fromEntries(
    CHART_MOVING_AVERAGE_PERIODS.map((period) => [`ma${period}`, createMovingAverageLine(candles, period)]),
  );

  return {
    candles,
    movingAverages,
  };
}

function normalizeSymbol(input: string) {
  return input
    .trim()
    .replace("KRW-", "")
    .replace("/KRW", "")
    .replace("_KRW", "")
    .toUpperCase();
}

function createEmptyChartFrame(error: string | null = null): ChartFrameState {
  return {
    frame: null,
    error,
    stale: false,
    generatedAt: null,
  };
}

function getTickerEntry(tickerData: TickerApiResponse, symbol: string) {
  const entry = tickerData.data[symbol];
  if (!entry || typeof entry === "string") {
    return null;
  }

  return entry;
}

function getScreenableSymbols(tickerData: TickerApiResponse) {
  return Object.keys(tickerData.data).filter((symbol) => {
    if (symbol === "date" || EXCLUDED_SYMBOLS.has(symbol)) {
      return false;
    }

    const tickerEntry = getTickerEntry(tickerData, symbol);
    if (!tickerEntry) {
      return false;
    }

    return Number(tickerEntry.closing_price) >= 0.01;
  });
}

function buildRow(
  tickerData: TickerApiResponse,
  marketMetadata: Map<string, MarketMeta>,
  symbol: string,
  currentPrice: number,
  dailyPrices: number[],
  monthlyPrices: number[],
): ScreenerRow {
  const tickerEntry = getTickerEntry(tickerData, symbol);
  if (!tickerEntry) {
    throw new Error(`Ticker entry is missing for ${symbol}`);
  }

  return {
    market: `${symbol}/KRW`,
    korean_name: marketMetadata.get(symbol)?.korean_name || symbol,
    english_name: marketMetadata.get(symbol)?.english_name || symbol,
    price: currentPrice,
    change: Number(tickerEntry.fluctate_rate_24H) / 100,
    volume: Number(tickerEntry.acc_trade_value_24H),
    ma20_d: calculateMA(dailyPrices, 20),
    ma60_d: calculateMA(dailyPrices, 60),
    ma120_d: calculateMA(dailyPrices, 120),
    ma240_d: calculateMA(dailyPrices, 240),
    ma120_m: calculateMA(monthlyPrices, 120),
    candle_count_m: monthlyPrices.length,
  };
}

function buildFourHourSymbolContext(hourlyCandles: ChartCandle[]): FourHourSymbolContext | null {
  const fourHourCandles = aggregateCandles(hourlyCandles, 4);
  if (fourHourCandles.length < MIN_FOUR_HOUR_CANDLES) {
    return null;
  }

  const currentCandle = fourHourCandles[fourHourCandles.length - 1];
  const completedCandles = fourHourCandles.slice(0, -1);
  const completedPrices = completedCandles.map((candle) => candle.close);

  return {
    currentCandle,
    currentPrice: currentCandle.close,
    completedCandles,
    completedPrices,
    ma20: calculateMA(completedPrices, 20),
    ma30: calculateMA(completedPrices, 30),
    ma120: calculateMA(completedPrices, 120),
    ma240: calculateMA(completedPrices, 240),
    averageNotionalVolume: calculateAverageNotionalVolume(
      completedCandles,
      ACTIVE_ENTRY_PROFILE.average4hNotionalVolumeLookbackBars,
    ),
  };
}

function appendDailyConditionMatches(
  resultsByCondition: ResultsByCondition,
  context: BaseSymbolContext,
) {
  const { currentPrice, dailyPrices, weeklyPrices, monthlyPrices, row } = context;
  const isDailyBullish = isBullishAlignment(dailyPrices);

  if (isDailyBullish) {
    resultsByCondition[5].push(row);
  }

  if (isDailyBullish && isWithinPercentRange(currentPrice, calculateMA(dailyPrices, 30), 6, -1)) {
    resultsByCondition[6].push(row);
  }

  if (isWithinPercentRange(currentPrice, row.ma120_d, 7, -1)) {
    resultsByCondition[7].push(row);
  }

  if (isWithinPercentRange(currentPrice, row.ma120_d, 10, -10)) {
    resultsByCondition[8].push(row);
  }

  if (isBullishAlignment(weeklyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
    resultsByCondition[9].push(row);
  }

  if (isBullishAlignment(monthlyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
    resultsByCondition[10].push(row);
  }
}

async function appendFourHourConditionMatches(
  resultsByCondition: ResultsByCondition,
  baseContext: BaseSymbolContext,
  fourHourContext: FourHourSymbolContext,
  passesTopBidOrderbook: () => Promise<boolean>,
) {
  const { symbol, currentPrice, dailyCandles, dailyPrices, row } = baseContext;
  const {
    currentCandle,
    currentPrice: currentFourHourPrice,
    completedPrices,
    ma20,
    ma30,
    ma120,
    ma240,
    averageNotionalVolume,
  } = fourHourContext;

  const meetsDailyConditionOneGuard = isAboveDailyMAThreshold(dailyPrices, 20, currentPrice, -3);
  const meetsDailyConditionThreeGuard = isAboveDailyMA(dailyPrices, 30, currentPrice);
  const meetsDailyConditionFourGuard = isAboveDailyMA(dailyPrices, 20, currentPrice);
  const dailyMa20 = calculateMA(dailyPrices, ACTIVE_ENTRY_PROFILE.currentTouchDailyMaPeriod);

  // 4시간봉 현재 가격은 진행 중인 캔들을 쓰되, MA는 완료된 4시간봉만으로 계산해
  // intrabar self-reference를 줄입니다.
  if (
    meetsDailyConditionOneGuard &&
    matchesFourHourRange(currentFourHourPrice, ma20, ma120) &&
    await passesTopBidOrderbook()
  ) {
    resultsByCondition[1].push(row);
  }

  if (isBullishAlignment(completedPrices) && await passesTopBidOrderbook()) {
    resultsByCondition[2].push(row);
  }

  if (
    meetsDailyConditionThreeGuard &&
    matchesFourHourRange(currentFourHourPrice, ma30, ma120) &&
    await passesTopBidOrderbook()
  ) {
    resultsByCondition[3].push(row);
  }

  if (
    meetsDailyConditionFourGuard &&
    matchesFourHourRange(currentFourHourPrice, ma30, ma120) &&
    await passesTopBidOrderbook()
  ) {
    resultsByCondition[4].push(row);
  }

  // perpDex_my live ma_touch_rr long entry proxy for spot screening.
  if (
    !ACTIVE_ENTRY_EXCLUDED_SYMBOLS.has(symbol) &&
    row.change >= ACTIVE_ENTRY_PROFILE.minPriceChangePct / 100 &&
    row.volume >= ACTIVE_ENTRY_PROFILE.min24hNotionalVolumeKrw &&
    dailyMa20 !== null &&
    currentFourHourPrice >= dailyMa20 &&
    passesDailyTouchEntry(currentCandle, dailyMa20) &&
    passesCandidateEnvelope(currentFourHourPrice, ma20, ma120, ma240) &&
    averageNotionalVolume !== null &&
    averageNotionalVolume >= ACTIVE_ENTRY_PROFILE.minAverage4hNotionalVolumeKrw &&
    passesRecentVolumeInflowInclusion(dailyCandles)
  ) {
    resultsByCondition[11].push(row);
  }
}

async function runConcurrentQueue<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const workerCount = Math.min(concurrency, queue.length || 1);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) {
          return;
        }

        await worker(item);
      }
    }),
  );
}

loadEnvFile();

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const fetchTimeoutMs = Number(process.env.FETCH_TIMEOUT_MS) || 8000;
  const cacheTtlMs = (Number(process.env.CACHE_TTL_MINUTES) || 15) * 60 * 1000;
  const logLevel = (process.env.LOG_LEVEL?.toUpperCase() as LogLevel | undefined) || "INFO";
  const publicDir = path.join(projectRoot, "public");
  const logsDir = path.join(projectRoot, "logs");
  const distDir = path.join(projectRoot, "dist");
  const isProduction = process.env.NODE_ENV === "production";
  const logFile = path.join(logsDir, `app-${new Date().toISOString().slice(0, 10)}.log`);
  let cachedDailyResults: ResultsCache | null = null;
  let cachedFourHourResults: ResultsCache | null = null;
  let cachedTickerSnapshot: { generatedAt: number; data: TickerApiResponse } | null = null;
  let cachedMarketMetadata: { generatedAt: number; data: Map<string, MarketMeta> } | null = null;
  const chartCache = new Map<string, AssetChartResponse & { generatedAt: number }>();
  let inflightDailyBuild: Promise<ResultsCache> | null = null;
  let inflightFourHourBuild: Promise<ResultsCache> | null = null;
  let inflightTickerSnapshot: Promise<TickerApiResponse> | null = null;
  let inflightMarketMetadata: Promise<Map<string, MarketMeta>> | null = null;
  const inflightChartRequests = new Map<string, Promise<AssetChartResponse>>();

  ensureDirectory(publicDir);
  ensureDirectory(logsDir);

  const logEvent: Logger = (level, event, details = {}) => {
    if (LOG_PRIORITY[level] < LOG_PRIORITY[logLevel]) {
      return;
    }

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      pid: process.pid,
      ...details,
    });

    fs.appendFileSync(logFile, `${entry}\n`);
    console.log(entry);
  };

  const fetchJson = async <T>(url: string, retryCount = 1): Promise<T> => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/json",
          },
          signal: AbortSignal.timeout(fetchTimeoutMs),
        });
        const responseText = await response.text();

        if (!response.ok) {
          const message = responseText.trim() || `HTTP ${response.status}`;
          throw new Error(message);
        }

        if (!responseText.trim()) {
          throw new Error("Empty response body");
        }

        try {
          return JSON.parse(responseText) as T;
        } catch (error) {
          throw new Error(
            `Failed to parse JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } catch (error) {
        lastError = error;
        if (attempt < retryCount) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  const getTickerData = async () => {
    if (cachedTickerSnapshot && Date.now() - cachedTickerSnapshot.generatedAt < TICKER_CACHE_TTL_MS) {
      return cachedTickerSnapshot.data;
    }

    if (!inflightTickerSnapshot) {
      inflightTickerSnapshot = fetchJson<TickerApiResponse>(`${BITHUMB_API_BASE_URL}/public/ticker/ALL_KRW`)
        .then((tickerData) => {
          if (tickerData.status !== "0000") {
            throw new Error("Bithumb ticker API error");
          }

          cachedTickerSnapshot = {
            generatedAt: Date.now(),
            data: tickerData,
          };
          return tickerData;
        })
        .finally(() => {
          inflightTickerSnapshot = null;
        });
    }

    return inflightTickerSnapshot;
  };

  const getMarketMetadata = async () => {
    if (cachedMarketMetadata && Date.now() - cachedMarketMetadata.generatedAt < MARKET_METADATA_CACHE_TTL_MS) {
      return cachedMarketMetadata.data;
    }

    if (!inflightMarketMetadata) {
      inflightMarketMetadata = fetchJson<MarketApiRow[]>(`${BITHUMB_API_BASE_URL}/v1/market/all`)
        .then((marketResponse) => {
          const marketMap = new Map<string, MarketMeta>();

          for (const item of marketResponse) {
            const symbol = String(item.market).replace("KRW-", "");
            marketMap.set(symbol, {
              korean_name: item.korean_name,
              english_name: item.english_name,
            });
          }

          cachedMarketMetadata = {
            generatedAt: Date.now(),
            data: marketMap,
          };
          return marketMap;
        })
        .finally(() => {
          inflightMarketMetadata = null;
        });
    }

    return inflightMarketMetadata;
  };

  const getAssetChartData = async (
    marketOrSymbol: string,
    forceRefresh = false,
    frameScope: ChartFrameScope = "all",
  ): Promise<AssetChartResponse> => {
    const symbol = normalizeSymbol(marketOrSymbol);
    const cachedChart = chartCache.get(symbol);

    if (!forceRefresh && frameScope === "all" && cachedChart && Date.now() - cachedChart.generatedAt < CHART_CACHE_TTL_MS) {
      return cachedChart;
    }

    const inflightChartRequest = inflightChartRequests.get(symbol);
    if (!forceRefresh && frameScope === "all" && inflightChartRequest) {
      return inflightChartRequest;
    }

    const buildFrameState = async (
      scope: Exclude<ChartFrameScope, "all">,
      previousState: ChartFrameState | undefined,
    ): Promise<ChartFrameState> => {
      if (frameScope !== "all" && frameScope !== scope) {
        return previousState ?? createEmptyChartFrame();
      }

      const url =
        scope === "daily"
          ? `${BITHUMB_API_BASE_URL}/public/candlestick/${symbol}_KRW/24h`
          : `${BITHUMB_API_BASE_URL}/public/candlestick/${symbol}_KRW/1h`;

      const retryCount = scope === "daily" ? 2 : 3;
      const label = scope === "daily" ? "일봉" : "4시간봉";

      try {
        const candleResponse = await fetchJson<CandleApiResponse>(url, retryCount);
        if (candleResponse.status !== "0000") {
          throw new Error(`${label} API status ${candleResponse.status}`);
        }

        const normalizedCandles = normalizeCandles(candleResponse.data);
        const chartCandles =
          scope === "daily" ? normalizedCandles : aggregateCandles(normalizedCandles, 4);

        if (chartCandles.length === 0) {
          throw new Error(`${label} 데이터가 비어 있습니다.`);
        }

        return {
          frame: createChartFrame(chartCandles),
          error: null,
          stale: false,
          generatedAt: Date.now(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (previousState?.frame) {
          return {
            ...previousState,
            error: `${label} 재호출 실패로 이전 캐시를 유지합니다. (${message})`,
            stale: true,
          };
        }

        return createEmptyChartFrame(`${label} 데이터를 가져오지 못했습니다. (${message})`);
      }
    };

    const chartRequest = Promise.all([
      buildFrameState("daily", cachedChart?.daily),
      buildFrameState("fourHour", cachedChart?.fourHour),
    ])
      .then(([daily, fourHour]) => {
        const chartPayload: AssetChartResponse = {
          market: `${symbol}/KRW`,
          symbol,
          generatedAt: Date.now(),
          daily,
          fourHour,
        };

        if (daily.frame || fourHour.frame) {
          chartCache.set(symbol, chartPayload);
        }

        return chartPayload;
      })
      .finally(() => {
        if (frameScope === "all") {
          inflightChartRequests.delete(symbol);
        }
      });

    if (frameScope === "all") {
      inflightChartRequests.set(symbol, chartRequest);
    }

    return chartRequest;
  };

  const hasLightTopBidOrderbook = async (symbol: string) => {
    const orderbookData = await fetchJson<OrderbookApiResponse>(`${BITHUMB_API_BASE_URL}/public/orderbook/${symbol}_KRW`);
    if (orderbookData.status !== "0000") {
      return false;
    }

    return getTopBidNotional(orderbookData.data.bids, 10) < 100_000_000;
  };

  const buildBaseSymbolContext = async (
    symbol: string,
    tickerData: TickerApiResponse,
    marketMetadata: Map<string, MarketMeta>,
  ): Promise<BaseSymbolContext | null> => {
    const dailyCandleData = await fetchJson<CandleApiResponse>(`${BITHUMB_API_BASE_URL}/public/candlestick/${symbol}_KRW/24h`);
    if (dailyCandleData.status !== "0000") {
      return null;
    }

    const dailyCandles = normalizeCandles(dailyCandleData.data);
    const dailyPrices = dailyCandles.map((candle) => candle.close);
    const weeklyPrices = toHigherTimeframePrices(dailyPrices, 7);
    const monthlyPrices = toHigherTimeframePrices(dailyPrices, 30);
    const currentPrice = dailyPrices[dailyPrices.length - 1];

    if (!Number.isFinite(currentPrice) || monthlyPrices.length < MIN_MONTHLY_CANDLES) {
      return null;
    }

    const rsi14 = calculateRSI(dailyPrices, 14);
    if (rsi14 === null || rsi14 < 40) {
      return null;
    }

    return {
      symbol,
      currentPrice,
      dailyCandles,
      dailyPrices,
      weeklyPrices,
      monthlyPrices,
      row: buildRow(tickerData, marketMetadata, symbol, currentPrice, dailyPrices, monthlyPrices),
    };
  };

  const writeCsv = (results: ScreenerRow[]) => {
    const rows = results
      .map((row) =>
        `${row.market},${row.price},${row.ma20_d?.toFixed(0) || "N/A"},${row.ma60_d?.toFixed(0) || "N/A"},${row.ma120_d?.toFixed(0) || "N/A"},${row.ma240_d?.toFixed(0) || "N/A"},${row.ma120_m?.toFixed(0) || "N/A"},${row.candle_count_m}`,
      )
      .join("\n");

    fs.writeFileSync(path.join(publicDir, "screener_result.csv"), CSV_HEADER + rows);
  };

  const buildDailyConditionResults = async (): Promise<ResultsCache> => {
    const [tickerData, marketMetadata] = await Promise.all([getTickerData(), getMarketMetadata()]);
    const resultsByCondition = createEmptyResults();

    await runConcurrentQueue(getScreenableSymbols(tickerData), 15, async (symbol) => {
      try {
        const baseContext = await buildBaseSymbolContext(symbol, tickerData, marketMetadata);
        if (!baseContext) {
          return;
        }
        appendDailyConditionMatches(resultsByCondition, baseContext);
      } catch (error) {
        logEvent("DEBUG", "daily_symbol_failed", {
          symbol,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return {
      generatedAt: Date.now(),
      resultsByCondition,
    };
  };

  const buildFourHourConditionResults = async (): Promise<ResultsCache> => {
    const [tickerData, marketMetadata] = await Promise.all([getTickerData(), getMarketMetadata()]);
    const resultsByCondition = createEmptyResults();

    await runConcurrentQueue(getScreenableSymbols(tickerData), 15, async (symbol) => {
      try {
        const baseContext = await buildBaseSymbolContext(symbol, tickerData, marketMetadata);
        if (!baseContext) {
          return;
        }

        const hourlyCandleData = await fetchJson<CandleApiResponse>(`${BITHUMB_API_BASE_URL}/public/candlestick/${symbol}_KRW/1h`);
        if (hourlyCandleData.status !== "0000") {
          return;
        }

        const hourlyCandles = normalizeCandles(hourlyCandleData.data);
        const fourHourContext = buildFourHourSymbolContext(hourlyCandles);
        if (!fourHourContext) {
          return;
        }

        let topBidOrderbookCheck: boolean | null = null;
        const passesTopBidOrderbook = async () => {
          if (topBidOrderbookCheck === null) {
            topBidOrderbookCheck = await hasLightTopBidOrderbook(symbol);
          }
          return topBidOrderbookCheck;
        };

        await appendFourHourConditionMatches(
          resultsByCondition,
          baseContext,
          fourHourContext,
          passesTopBidOrderbook,
        );
      } catch (error) {
        logEvent("DEBUG", "four_hour_symbol_failed", {
          symbol,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return {
      generatedAt: Date.now(),
      resultsByCondition,
    };
  };

  const getDailyResults = async (forceRefresh: boolean) => {
    if (!forceRefresh && cachedDailyResults && Date.now() - cachedDailyResults.generatedAt < cacheTtlMs) {
      return cachedDailyResults;
    }

    if (forceRefresh) {
      cachedDailyResults = null;
    }

    if (!inflightDailyBuild) {
      inflightDailyBuild = buildDailyConditionResults()
        .then((results) => {
          cachedDailyResults = results;
          return results;
        })
        .finally(() => {
          inflightDailyBuild = null;
        });
    }

    return inflightDailyBuild;
  };

  const getFourHourResults = async (forceRefresh: boolean) => {
    if (!forceRefresh && cachedFourHourResults && Date.now() - cachedFourHourResults.generatedAt < cacheTtlMs) {
      return cachedFourHourResults;
    }

    if (forceRefresh) {
      cachedFourHourResults = null;
    }

    if (!inflightFourHourBuild) {
      inflightFourHourBuild = buildFourHourConditionResults()
        .then((results) => {
          cachedFourHourResults = results;
          return results;
        })
        .finally(() => {
          inflightFourHourBuild = null;
        });
    }

    return inflightFourHourBuild;
  };

  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV || "undefined",
      uptimeSeconds: Number(process.uptime().toFixed(1)),
    });
  });

  app.get("/api/crypto", async (req, res) => {
    const requested = req.query.conditionId ? parseInt(req.query.conditionId.toString(), 10) : 1;
    const conditionId = (ALL_CONDITION_IDS.includes(requested as ConditionId) ? requested : 1) as ConditionId;
    const forceRefresh = req.query.refresh === "1";
    const isDailyCondition = DAILY_CONDITION_IDS.includes(conditionId);

    res.setHeader("Content-Type", "application/json");

    try {
      const { generatedAt, resultsByCondition } = isDailyCondition
        ? await getDailyResults(forceRefresh)
        : await getFourHourResults(forceRefresh);

      const results = resultsByCondition[conditionId];
      const relevantConditionIds = isDailyCondition ? DAILY_CONDITION_IDS : FOUR_HOUR_CONDITION_IDS;
      const relevantData = Object.fromEntries(
        relevantConditionIds.map((id) => [id, resultsByCondition[id]]),
      );

      writeCsv(results);

      return res.json({
        success: true,
        count: results.length,
        data: results,
        allData: relevantData,
        generatedAt,
        downloadUrl: "/screener_result.csv",
      });
    } catch (error) {
      logEvent("ERROR", "api_crypto_failed", {
        conditionId,
        message: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({ success: false, error: "Failed to fetch data" });
    }
  });

  app.get("/api/chart", async (req, res) => {
    const market = req.query.market?.toString() ?? "";
    const forceRefresh = req.query.refresh === "1";
    const rawFrame = req.query.frame?.toString();
    const frameScope: ChartFrameScope =
      rawFrame === "daily" || rawFrame === "fourHour" ? rawFrame : "all";

    if (!market.trim()) {
      return res.status(400).json({
        success: false,
        error: "market query is required",
      });
    }

    try {
      const chartData = await getAssetChartData(market, forceRefresh, frameScope);
      return res.json({
        success: true,
        ...chartData,
      });
    } catch (error) {
      logEvent("ERROR", "api_chart_failed", {
        market,
        message: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error: "Failed to fetch chart data",
      });
    }
  });

  app.use(express.static(publicDir));

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const server = app.listen(port, "0.0.0.0", () => {
    logEvent("INFO", "server_started", {
      port,
      command: process.argv.join(" "),
      nodeEnv: process.env.NODE_ENV || "undefined",
      cwd: process.cwd(),
      distExists: fs.existsSync(distDir),
    });
  });

  const shutdown = (signal: string) => {
    logEvent("INFO", "server_stopping", { signal });
    server.close(() => {
      logEvent("INFO", "server_stopped", { signal });
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (error) => {
    logEvent("ERROR", "uncaught_exception", { message: error.message });
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logEvent("ERROR", "unhandled_rejection", { message: String(reason) });
  });
}

startServer();
