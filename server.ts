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
type FourHourRangeVariant = "120" | "240";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const CACHE_TTL_MS = 15 * 60 * 1000;
  let cachedDailyResults: { generatedAt: number; resultsByCondition: ResultsByCondition } | null = null;
  let cachedFourHourResults: { generatedAt: number; resultsByCondition: ResultsByCondition } | null = null;
  let inflightDailyBuild: Promise<{ generatedAt: number; resultsByCondition: ResultsByCondition }> | null = null;
  let inflightFourHourBuild: Promise<{ generatedAt: number; resultsByCondition: ResultsByCondition }> | null = null;
  let cachedExperimentalFourHourResults: { generatedAt: number; resultsByCondition: ResultsByCondition } | null = null;
  let inflightExperimentalFourHourBuild: Promise<{ generatedAt: number; resultsByCondition: ResultsByCondition }> | null = null;

  app.use(express.json());

  const calculateMA = (prices: number[], period: number) => {
    if (prices.length < period) return null;
    const sum = prices.slice(0, period).reduce((acc, p) => acc + p, 0);
    return sum / period;
  };

  const fetchJson = async (url: string) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    return response.json();
  };

  const toHigherTimeframePrices = (prices: number[], step: number) => {
    const higherTimeframePrices = [];
    for (let i = 0; i < prices.length; i += step) {
      higherTimeframePrices.push(prices[i]);
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
    longVariant: FourHourRangeVariant,
  ) => {
    const longUpper = longVariant === "240" ? 3 : 2;
    const longLower = longVariant === "240" ? -12 : -10;

    return (
      isWithinPercentRange(currentPrice, shortMa, 5, -1) &&
      isWithinPercentRange(currentPrice, longMa, longUpper, longLower)
    );
  };

  const calculateRSI = (prices: number[], period = 14) => {
    if (!Array.isArray(prices) || prices.length < period + 1) return null;
    const closes = [...prices].reverse();

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

          const dailyPrices = [...dailyCandleData.data].reverse().map((c) => parseFloat(c[2]));
          const weeklyPrices = toHigherTimeframePrices(dailyPrices, 7);
          const monthlyPrices = toHigherTimeframePrices(dailyPrices, 30);

          if (monthlyPrices.length < 2) {
            continue;
          }

          const currentPrice = dailyPrices[0];
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
        } catch {}
      }
    });

    await Promise.all(workers);

    return {
      generatedAt: Date.now(),
      resultsByCondition,
    };
  };

  const buildFourHourConditionResults = async (rangeVariant: FourHourRangeVariant = "120") => {
    const tickerData = await getTickerData();
    const resultsByCondition = createEmptyResults();
    const queue = [...getScreenableSymbols(tickerData)];
    const concurrency = 15;

    const workers = Array(concurrency).fill(null).map(async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();
        if (!symbol) break;

        try {
          const [dailyCandleData, hourlyCandleData] = await Promise.all([
            fetchJson(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/24h`),
            fetchJson(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/1h`),
          ]);

          if (dailyCandleData.status !== "0000" || hourlyCandleData.status !== "0000") {
            continue;
          }

          const dailyPrices = [...dailyCandleData.data].reverse().map((c) => parseFloat(c[2]));
          const hourlyPrices = [...hourlyCandleData.data].reverse().map((c) => parseFloat(c[2]));
          const fourHourPrices = toHigherTimeframePrices(hourlyPrices, 4);
          const monthlyPrices = toHigherTimeframePrices(dailyPrices, 30);

          if (monthlyPrices.length < 2 || fourHourPrices.length < 240) {
            continue;
          }

          const currentPrice = dailyPrices[0];
          const currentFourHourPrice = fourHourPrices[0];
          const rsi14 = calculateRSI(dailyPrices, 14);

          if (rsi14 === null || rsi14 < 40) {
            continue;
          }

          const ma20FourHour = calculateMA(fourHourPrices, 20);
          const ma120FourHour = calculateMA(fourHourPrices, 120);
          const ma240FourHour = calculateMA(fourHourPrices, 240);
          const row = buildRow(tickerData, symbol, currentPrice, dailyPrices, monthlyPrices);

          const rangeMovingAverage = rangeVariant === "240" ? ma240FourHour : ma120FourHour;
          if (matchesFourHourRange(currentFourHourPrice, ma20FourHour, rangeMovingAverage, rangeVariant)) {
            resultsByCondition[4].push(row);
          }

          if (isBullishAlignment(fourHourPrices)) {
            resultsByCondition[5].push(row);
          }
        } catch {}
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

  const getFourHourResults = async (forceRefresh: boolean, rangeVariant: FourHourRangeVariant = "120") => {
    const isExperimentalVariant = rangeVariant === "240";
    const cachedResults = isExperimentalVariant ? cachedExperimentalFourHourResults : cachedFourHourResults;

    if (!forceRefresh && cachedResults && Date.now() - cachedResults.generatedAt < CACHE_TTL_MS) {
      return cachedResults;
    }

    if (forceRefresh) {
      if (isExperimentalVariant) {
        cachedExperimentalFourHourResults = null;
      } else {
        cachedFourHourResults = null;
      }
    }

    const inflightBuild = isExperimentalVariant ? inflightExperimentalFourHourBuild : inflightFourHourBuild;
    if (!inflightBuild) {
      const nextBuild = buildFourHourConditionResults(rangeVariant)
        .then((results) => {
          if (isExperimentalVariant) {
            cachedExperimentalFourHourResults = results;
          } else {
            cachedFourHourResults = results;
          }
          return results;
        })
        .finally(() => {
          if (isExperimentalVariant) {
            inflightExperimentalFourHourBuild = null;
          } else {
            inflightFourHourBuild = null;
          }
        });

      if (isExperimentalVariant) {
        inflightExperimentalFourHourBuild = nextBuild;
      } else {
        inflightFourHourBuild = nextBuild;
      }
    }

    return isExperimentalVariant ? inflightExperimentalFourHourBuild! : inflightFourHourBuild!;
  };

  // API Route: Fetch Crypto Data from Bithumb with Multi-Timeframe Analysis
  app.get("/api/crypto", async (req, res) => {
    const requested = req.query.conditionId ? parseInt(req.query.conditionId.toString(), 10) : 1;
    const conditionId = ([1, 2, 3, 4, 5].includes(requested) ? requested : 1) as ConditionId;
    const forceRefresh = req.query.refresh === "1";
    const isDailyCondition = conditionId <= 3;
    const rangeVariant = req.query.variant === "240" ? "240" : "120";

    res.setHeader("Content-Type", "application/json");

    try {
      const { resultsByCondition, generatedAt } = isDailyCondition
        ? await getDailyResults(forceRefresh)
        : await getFourHourResults(forceRefresh, rangeVariant);
      const results = resultsByCondition[conditionId];

      const csvHeader = "Market,Price,MA20(D),MA60(D),MA120(D),MA240(D),MA120(M),MonthlyCandles\n";
      const csvRows = results.map((r) =>
        `${r.market},${r.price},${r.ma20_d?.toFixed(0) || "N/A"},${r.ma60_d?.toFixed(0) || "N/A"},${r.ma120_d?.toFixed(0) || "N/A"},${r.ma240_d?.toFixed(0) || "N/A"},${r.ma120_m?.toFixed(0) || "N/A"},${r.candle_count_m}`
      ).join("\n");
      const csvContent = csvHeader + csvRows;

      const publicDir = path.join(__dirname, "public");
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
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
      console.error("Error fetching Bithumb data:", error);
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
