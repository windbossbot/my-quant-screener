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

type ConditionId = 1 | 2 | 3 | 4 | 5 | 6;
type ResultsByCondition = Record<ConditionId, ScreenerRow[]>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const CACHE_TTL_MS = 15 * 60 * 1000;
  let cachedResults: { generatedAt: number; resultsByCondition: ResultsByCondition } | null = null;
  let inflightBuild: Promise<{ generatedAt: number; resultsByCondition: ResultsByCondition }> | null = null;

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

  const buildAllConditionResults = async () => {
    const tickerResponse = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW");
    const tickerData = await tickerResponse.json();

    if (tickerData.status !== "0000") {
      throw new Error("Bithumb API Error");
    }

    const resultsByCondition: ResultsByCondition = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };

    const symbols = Object.keys(tickerData.data).filter((s) =>
      s !== "date" && !["USDC", "USDT", "USD1", "USDE", "USDS"].includes(s)
    );

    const preFilteredSymbols = symbols.filter((symbol) => {
      const price = parseFloat(tickerData.data[symbol].closing_price);
      return price >= 0.01;
    });

    const concurrency = 15;
    const queue = [...preFilteredSymbols];

    const workers = Array(concurrency).fill(null).map(async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();
        if (!symbol) break;

        try {
          const [dailyCandleData, fourHourCandleData] = await Promise.all([
            fetchJson(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/24h`),
            fetchJson(`https://api.bithumb.com/v1/candles/minutes/240?market=KRW-${symbol}&count=240`),
          ]);

          if (dailyCandleData.status !== "0000" || !Array.isArray(fourHourCandleData)) {
            continue;
          }

          const dailyPrices = [...dailyCandleData.data].reverse().map((c) => parseFloat(c[2]));
          const fourHourPrices = [...fourHourCandleData].map((c) => Number(c.trade_price));
          const weeklyPrices = toHigherTimeframePrices(dailyPrices, 7);
          const monthlyPrices = toHigherTimeframePrices(dailyPrices, 30);

          if (monthlyPrices.length < 2 || fourHourPrices.length < 20) {
            continue;
          }

          const currentPrice = dailyPrices[0];
          const currentFourHourPrice = fourHourPrices[0];
          const rsi14 = calculateRSI(dailyPrices, 14);

          if (rsi14 === null || rsi14 < 40) {
            continue;
          }

          const ma20Daily = calculateMA(dailyPrices, 20);
          const ma60Daily = calculateMA(dailyPrices, 60);
          const ma120Daily = calculateMA(dailyPrices, 120);
          const ma240Daily = calculateMA(dailyPrices, 240);
          const ma20FourHour = calculateMA(fourHourPrices, 20);
          const ma120FourHour = calculateMA(fourHourPrices, 120);
          const ma240FourHour = calculateMA(fourHourPrices, 240);

          const row: ScreenerRow = {
            market: `${symbol}/KRW`,
            korean_name: symbol,
            english_name: symbol,
            price: currentPrice,
            change: parseFloat(tickerData.data[symbol].fluctate_rate_24H) / 100,
            volume: parseFloat(tickerData.data[symbol].acc_trade_value_24H),
            ma20_d: ma20Daily,
            ma60_d: ma60Daily,
            ma120_d: ma120Daily,
            ma240_d: ma240Daily,
            ma120_m: calculateMA(monthlyPrices, 120),
            candle_count_m: monthlyPrices.length,
          };

          if (isBullishAlignment(dailyPrices)) {
            resultsByCondition[1].push(row);
          }

          if (isBullishAlignment(monthlyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
            resultsByCondition[2].push(row);
          }

          if (isBullishAlignment(weeklyPrices) && isNearDailyMA20(dailyPrices, currentPrice)) {
            resultsByCondition[3].push(row);
          }

          if (
            currentFourHourPrice !== null &&
            isWithinPercentRange(currentFourHourPrice, ma20FourHour, 5, -1) &&
            isWithinPercentRange(currentFourHourPrice, ma120FourHour, 2, -10)
          ) {
            resultsByCondition[4].push(row);
          }

          if (
            currentFourHourPrice !== null &&
            isWithinPercentRange(currentFourHourPrice, ma20FourHour, 5, -1) &&
            isWithinPercentRange(currentFourHourPrice, ma240FourHour, 2, -10)
          ) {
            resultsByCondition[5].push(row);
          }

          if (isBullishAlignment(fourHourPrices)) {
            resultsByCondition[6].push(row);
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

  const getConditionResults = async (forceRefresh: boolean) => {
    if (!forceRefresh && cachedResults && Date.now() - cachedResults.generatedAt < CACHE_TTL_MS) {
      return cachedResults;
    }

    if (forceRefresh) {
      cachedResults = null;
    }

    if (!inflightBuild) {
      inflightBuild = buildAllConditionResults()
        .then((results) => {
          cachedResults = results;
          return results;
        })
        .finally(() => {
          inflightBuild = null;
        });
    }

    return inflightBuild;
  };

  // API Route: Fetch Crypto Data from Bithumb with Multi-Timeframe Analysis
  app.get("/api/crypto", async (req, res) => {
    const requested = req.query.conditionId ? parseInt(req.query.conditionId.toString(), 10) : 1;
    const conditionId = ([1, 2, 3, 4, 5, 6].includes(requested) ? requested : 1) as ConditionId;
    const forceRefresh = req.query.refresh === "1";

    res.setHeader("Content-Type", "application/json");

    try {
      const { resultsByCondition, generatedAt } = await getConditionResults(forceRefresh);
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
