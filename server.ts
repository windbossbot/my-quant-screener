import express from "express";
import fs from "fs";
import path from "path";

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

type ConditionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
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
  dailyPrices: number[];
  weeklyPrices: number[];
  monthlyPrices: number[];
  row: ScreenerRow;
};

const projectRoot = process.cwd();
const DAILY_CONDITION_IDS: ConditionId[] = [5, 6, 7, 8, 9];
const FOUR_HOUR_CONDITION_IDS: ConditionId[] = [1, 2, 3, 4];
const ALL_CONDITION_IDS: ConditionId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const EXCLUDED_SYMBOLS = new Set(["USDC", "USDT", "USD1", "USDE", "USDS"]);
const LOG_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  ERROR: 30,
};
const CSV_HEADER = "Market,Price,MA20(D),MA60(D),MA120(D),MA240(D),MA120(M),MonthlyCandles\n";

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
  return {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
    8: [],
    9: [],
  };
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

function extractClosingPrices(candles: Array<Array<string | number>>) {
  return candles.map((candle) => Number(candle[2]));
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
  let inflightDailyBuild: Promise<ResultsCache> | null = null;
  let inflightFourHourBuild: Promise<ResultsCache> | null = null;

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

  const fetchJson = async <T>(url: string): Promise<T> => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    return response.json() as Promise<T>;
  };

  const getTickerData = async () => {
    const tickerData = await fetchJson<TickerApiResponse>("https://api.bithumb.com/public/ticker/ALL_KRW");
    if (tickerData.status !== "0000") {
      throw new Error("Bithumb ticker API error");
    }
    return tickerData;
  };

  const getMarketMetadata = async () => {
    const marketResponse = await fetchJson<MarketApiRow[]>("https://api.bithumb.com/v1/market/all");
    const marketMap = new Map<string, MarketMeta>();

    for (const item of marketResponse) {
      const symbol = String(item.market).replace("KRW-", "");
      marketMap.set(symbol, {
        korean_name: item.korean_name,
        english_name: item.english_name,
      });
    }

    return marketMap;
  };

  const hasLightTopBidOrderbook = async (symbol: string) => {
    const orderbookData = await fetchJson<OrderbookApiResponse>(`https://api.bithumb.com/public/orderbook/${symbol}_KRW`);
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
    const dailyCandleData = await fetchJson<CandleApiResponse>(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/24h`);
    if (dailyCandleData.status !== "0000") {
      return null;
    }

    const dailyPrices = extractClosingPrices(dailyCandleData.data);
    const weeklyPrices = toHigherTimeframePrices(dailyPrices, 7);
    const monthlyPrices = toHigherTimeframePrices(dailyPrices, 30);
    const currentPrice = dailyPrices[dailyPrices.length - 1];

    if (!Number.isFinite(currentPrice) || monthlyPrices.length < 2) {
      return null;
    }

    const rsi14 = calculateRSI(dailyPrices, 14);
    if (rsi14 === null || rsi14 < 40) {
      return null;
    }

    return {
      symbol,
      currentPrice,
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

        const { currentPrice, dailyPrices, weeklyPrices, monthlyPrices, row } = baseContext;
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

        if (isBullishAlignment(weeklyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
          resultsByCondition[8].push(row);
        }

        if (isBullishAlignment(monthlyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
          resultsByCondition[9].push(row);
        }
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

        const { currentPrice, dailyPrices, row } = baseContext;

        const meetsDailyConditionOneGuard = isAboveDailyMAThreshold(dailyPrices, 20, currentPrice, -3);
        const meetsDailyConditionThreeGuard = isAboveDailyMA(dailyPrices, 30, currentPrice);
        const meetsDailyConditionFourGuard = isAboveDailyMA(dailyPrices, 20, currentPrice);

        const hourlyCandleData = await fetchJson<CandleApiResponse>(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/1h`);
        if (hourlyCandleData.status !== "0000") {
          return;
        }

        const hourlyPrices = extractClosingPrices(hourlyCandleData.data);
        const fourHourPrices = toHigherTimeframePrices(hourlyPrices, 4);
        if (fourHourPrices.length < 240) {
          return;
        }

        const currentFourHourPrice = fourHourPrices[fourHourPrices.length - 1];
        const ma20FourHour = calculateMA(fourHourPrices, 20);
        const ma30FourHour = calculateMA(fourHourPrices, 30);
        const ma120FourHour = calculateMA(fourHourPrices, 120);

        let topBidOrderbookCheck: boolean | null = null;
        const passesTopBidOrderbook = async () => {
          if (topBidOrderbookCheck === null) {
            topBidOrderbookCheck = await hasLightTopBidOrderbook(symbol);
          }
          return topBidOrderbookCheck;
        };

        if (
          meetsDailyConditionOneGuard &&
          matchesFourHourRange(currentFourHourPrice, ma20FourHour, ma120FourHour) &&
          await passesTopBidOrderbook()
        ) {
          resultsByCondition[1].push(row);
        }

        if (isBullishAlignment(fourHourPrices) && await passesTopBidOrderbook()) {
          resultsByCondition[2].push(row);
        }

        if (
          meetsDailyConditionThreeGuard &&
          matchesFourHourRange(currentFourHourPrice, ma30FourHour, ma120FourHour) &&
          await passesTopBidOrderbook()
        ) {
          resultsByCondition[3].push(row);
        }

        if (
          meetsDailyConditionFourGuard &&
          matchesFourHourRange(currentFourHourPrice, ma30FourHour, ma120FourHour) &&
          await passesTopBidOrderbook()
        ) {
          resultsByCondition[4].push(row);
        }
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
