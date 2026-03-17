import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

type ConditionId = 1 | 2 | 3 | 4 | 5;
type ResultsByCondition = Record<ConditionId, ScreenerRow[]>;
type LogLevel = "DEBUG" | "INFO" | "ERROR";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
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

loadEnvFile();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 8000;
  const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_MINUTES) || 15) * 60 * 1000;
  const LOG_LEVEL = (process.env.LOG_LEVEL?.toUpperCase() as LogLevel | undefined) || "INFO";
  const publicDir = path.join(__dirname, "public");
  const logsDir = path.join(__dirname, "logs");
  const logFile = path.join(logsDir, `app-${new Date().toISOString().slice(0, 10)}.log`);
  let cachedDailyResults: { generatedAt: number; resultsByCondition: ResultsByCondition } | null = null;
  let cachedFourHourResults: { generatedAt: number; resultsByCondition: ResultsByCondition } | null = null;
  let inflightDailyBuild: Promise<{ generatedAt: number; resultsByCondition: ResultsByCondition }> | null = null;
  let inflightFourHourBuild: Promise<{ generatedAt: number; resultsByCondition: ResultsByCondition }> | null = null;

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

  const logPriority: Record<LogLevel, number> = {
    DEBUG: 10,
    INFO: 20,
    ERROR: 30,
  };

  const logEvent = (level: LogLevel, event: string, details: Record<string, unknown> = {}) => {
    if (logPriority[level] < logPriority[LOG_LEVEL]) {
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

  app.use(express.json());

  const calculateMA = (prices: number[], period: number) => {
    if (prices.length < period) return null;
    const sum = prices.slice(-period).reduce((acc, p) => acc + p, 0);
    return sum / period;
  };

  const fetchJson = async (url: string) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return response.json();
  };

  const toHigherTimeframePrices = (prices: number[], step: number) => {
    const higherTimeframePrices = [];
    for (let i = 0; i < prices.length; i += step) {
      const chunk = prices.slice(i, i + step);
      if (chunk.length > 0) {
        higherTimeframePrices.push(chunk[chunk.length - 1]);
      }
    }
    return higherTimeframePrices;
  };

  const isBullishAlignment = (prices: number[]) => {
    const ma20 = calculateMA(prices, 20);
    const ma60 = calculateMA(prices, 60);
    const ma120 = calculateMA(prices, 120);

    if (ma20 === null || ma60 === null) {
      return false;
    }

    if (ma120 !== null) {
      return ma20 > ma60 && ma60 > ma120;
    }

    return ma20 > ma60;
  };

  const isNearDailyMA20 = (prices: number[], currentPrice: number) => {
    const ma20 = calculateMA(prices, 20);
    if (ma20 === null) {
      return false;
    }

    const lowerLimit = ma20 * 0.95;
    const upperLimit = ma20 * 1.05;
    return currentPrice >= lowerLimit && currentPrice <= upperLimit;
  };

  const isAboveDailyMA30Threshold = (prices: number[], currentPrice: number, lowerPercent: number) => {
    const ma30 = calculateMA(prices, 30);
    if (ma30 === null) {
      return false;
    }

    const lowerLimit = ma30 * (1 + lowerPercent / 100);
    return currentPrice >= lowerLimit;
  };

  const isWithinPercentRange = (currentPrice: number, movingAverage: number | null, upperPercent: number, lowerPercent: number) => {
    if (movingAverage === null) {
      return false;
    }

    const upperLimit = movingAverage * (1 + upperPercent / 100);
    const lowerLimit = movingAverage * (1 + lowerPercent / 100);
    return currentPrice >= lowerLimit && currentPrice <= upperLimit;
  };

  const matchesFourHourRange = (
    currentPrice: number,
    shortMa: number | null,
    longMa: number | null,
  ) => {
    return (
      isWithinPercentRange(currentPrice, shortMa, 5, -1) &&
      isWithinPercentRange(currentPrice, longMa, 2, -10)
    );
  };

  const calculateRSI = (prices: number[], period = 14) => {
    if (!Array.isArray(prices) || prices.length < period + 1) return null;
    const closes = prices;

    let gainSum = 0;
    let lossSum = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gainSum += change;
      else lossSum += -change;
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  };

  const getTickerData = async () => {
    const tickerResponse = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW");
    const tickerData = await tickerResponse.json();

    if (tickerData.status !== "0000") {
      throw new Error("Bithumb API Error");
    }

    return tickerData;
  };

  const createEmptyResults = (): ResultsByCondition => ({
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
    });

  const getScreenableSymbols = (tickerData: any) => {
    const symbols = Object.keys(tickerData.data).filter((s) =>
      s !== "date" && !["USDC", "USDT", "USD1", "USDE", "USDS"].includes(s)
    );

    return symbols.filter((symbol) => {
      const price = parseFloat(tickerData.data[symbol].closing_price);
      return price >= 0.01;
    });
  };

  const buildRow = (tickerData: any, symbol: string, currentPrice: number, dailyPrices: number[], monthlyPrices: number[]): ScreenerRow => ({
    market: `${symbol}/KRW`,
    korean_name: symbol,
    english_name: symbol,
    price: currentPrice,
    change: parseFloat(tickerData.data[symbol].fluctate_rate_24H) / 100,
    volume: parseFloat(tickerData.data[symbol].acc_trade_value_24H),
    ma20_d: calculateMA(dailyPrices, 20),
    ma60_d: calculateMA(dailyPrices, 60),
    ma120_d: calculateMA(dailyPrices, 120),
    ma240_d: calculateMA(dailyPrices, 240),
    ma120_m: calculateMA(monthlyPrices, 120),
    candle_count_m: monthlyPrices.length,
  });

  const buildDailyConditionResults = async () => {
    const tickerData = await getTickerData();
    const resultsByCondition = createEmptyResults();
    const queue = [...getScreenableSymbols(tickerData)];
    const concurrency = 15;

    const workers = Array(concurrency).fill(null).map(async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();
        if (!symbol) break;

        try {
          const dailyCandleData = await fetchJson(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/24h`);
          if (dailyCandleData.status !== "0000") {
            continue;
          }

          const dailyPrices = dailyCandleData.data.map((c) => parseFloat(c[2]));
          const weeklyPrices = toHigherTimeframePrices(dailyPrices, 7);
          const monthlyPrices = toHigherTimeframePrices(dailyPrices, 30);

          if (monthlyPrices.length < 2) {
            continue;
          }

          const currentPrice = dailyPrices[dailyPrices.length - 1];
          const rsi14 = calculateRSI(dailyPrices, 14);

          if (rsi14 === null || rsi14 < 40) {
            continue;
          }

          const row = buildRow(tickerData, symbol, currentPrice, dailyPrices, monthlyPrices);

          if (isBullishAlignment(dailyPrices)) {
            resultsByCondition[1].push(row);
          }
          if (isBullishAlignment(monthlyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
            resultsByCondition[2].push(row);
          }
          if (isBullishAlignment(weeklyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
            resultsByCondition[3].push(row);
          }
        } catch (error) {
          logEvent("DEBUG", "daily_symbol_failed", {
            symbol,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    await Promise.all(workers);

    return {
      generatedAt: Date.now(),
      resultsByCondition,
    };
  };

  const buildFourHourConditionResults = async () => {
    const tickerData = await getTickerData();
    const resultsByCondition = createEmptyResults();
    const queue = [...getScreenableSymbols(tickerData)];
    const concurrency = 15;

    const workers = Array(concurrency).fill(null).map(async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();
        if (!symbol) break;

        try {
          const dailyCandleData = await fetchJson(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/24h`);

          if (dailyCandleData.status !== "0000") {
            continue;
          }

          const dailyPrices = dailyCandleData.data.map((c) => parseFloat(c[2]));
          const monthlyPrices = toHigherTimeframePrices(dailyPrices, 30);

          if (monthlyPrices.length < 2) {
            continue;
          }

          const currentPrice = dailyPrices[dailyPrices.length - 1];
          const rsi14 = calculateRSI(dailyPrices, 14);

          if (rsi14 === null || rsi14 < 40) {
            continue;
          }

          const meetsDailyConditionFourGuard = isAboveDailyMA30Threshold(dailyPrices, currentPrice, -3);
          const hourlyCandleData = await fetchJson(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/1h`);
          if (hourlyCandleData.status !== "0000") {
            continue;
          }

          const hourlyPrices = hourlyCandleData.data.map((c) => parseFloat(c[2]));
          const fourHourPrices = toHigherTimeframePrices(hourlyPrices, 4);
          if (fourHourPrices.length < 240) {
            continue;
          }

          const currentFourHourPrice = fourHourPrices[fourHourPrices.length - 1];

          const ma30FourHour = calculateMA(fourHourPrices, 30);
          const ma120FourHour = calculateMA(fourHourPrices, 120);
          const row = buildRow(tickerData, symbol, currentPrice, dailyPrices, monthlyPrices);

          if (
            meetsDailyConditionFourGuard &&
            matchesFourHourRange(currentFourHourPrice, ma30FourHour, ma120FourHour)
          ) {
            resultsByCondition[4].push(row);
          }

          if (isBullishAlignment(fourHourPrices)) {
            resultsByCondition[5].push(row);
          }
        } catch (error) {
          logEvent("DEBUG", "four_hour_symbol_failed", {
            symbol,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    await Promise.all(workers);

    return {
      generatedAt: Date.now(),
      resultsByCondition,
    };
  };

  const getDailyResults = async (forceRefresh: boolean) => {
    if (!forceRefresh && cachedDailyResults && Date.now() - cachedDailyResults.generatedAt < CACHE_TTL_MS) {
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
    if (!forceRefresh && cachedFourHourResults && Date.now() - cachedFourHourResults.generatedAt < CACHE_TTL_MS) {
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

  // API Route: Fetch Crypto Data from Bithumb with Multi-Timeframe Analysis
  app.get("/api/crypto", async (req, res) => {
    const requested = req.query.conditionId ? parseInt(req.query.conditionId.toString(), 10) : 1;
    const conditionId = ([1, 2, 3, 4, 5].includes(requested) ? requested : 1) as ConditionId;
    const forceRefresh = req.query.refresh === "1";
    const isDailyCondition = conditionId <= 3;

    res.setHeader("Content-Type", "application/json");

    try {
      const { resultsByCondition, generatedAt } = isDailyCondition
        ? await getDailyResults(forceRefresh)
        : await getFourHourResults(forceRefresh);
      const results = resultsByCondition[conditionId];

      const csvHeader = "Market,Price,MA20(D),MA60(D),MA120(D),MA240(D),MA120(M),MonthlyCandles\n";
      const csvRows = results.map((r) =>
        `${r.market},${r.price},${r.ma20_d?.toFixed(0) || "N/A"},${r.ma60_d?.toFixed(0) || "N/A"},${r.ma120_d?.toFixed(0) || "N/A"},${r.ma240_d?.toFixed(0) || "N/A"},${r.ma120_m?.toFixed(0) || "N/A"},${r.candle_count_m}`
      ).join("\n");
      const csvContent = csvHeader + csvRows;

      fs.writeFileSync(path.join(publicDir, "screener_result.csv"), csvContent);

      return res.json({
        success: true,
        count: results.length,
        data: results,
        allData: resultsByCondition,
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

  app.use(express.static(path.join(__dirname, "public")));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    logEvent("INFO", "server_started", { port: PORT, command: process.argv.join(" ") });
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
