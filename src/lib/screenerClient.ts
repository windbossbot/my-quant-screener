import { readSessionValue, writeSessionValue } from "./session";
import type { AssetChartData, CachedConditionData, ChartFrameScope, CryptoData, SortConfig } from "../types";

const FAVORITES_KEY = "quant-screener-favorites";
const inflightRequests = new Map<number, Promise<CachedConditionData | null>>();
const CHART_CACHE_PREFIX = "quant-screener-chart-";
const inflightChartRequests = new Map<string, Promise<AssetChartData | null>>();

async function requestJson<T>(path: string, params: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  const responseText = await response.text();

  if (!response.ok) {
    const reason = responseText.trim() || `status ${response.status}`;
    throw new Error(reason);
  }

  if (!responseText.trim()) {
    throw new Error("Empty response body");
  }

  return JSON.parse(responseText) as T;
}

export const getCacheKey = (conditionId: number) => `quant-screener-condition-${conditionId}`;
export const getChartCacheKey = (market: string) => `${CHART_CACHE_PREFIX}${market}`;

export function readCachedConditionData(conditionId: number) {
  return readSessionValue<CachedConditionData>(getCacheKey(conditionId));
}

export function writeCachedConditionData(conditionId: number, data: CryptoData[], lastUpdated: string) {
  writeSessionValue(getCacheKey(conditionId), { data, lastUpdated });
}

export function clearConditionCache(conditionIds: number[]) {
  conditionIds.forEach((conditionId) => {
    sessionStorage.removeItem(getCacheKey(conditionId));
  });
}

export function readCachedChartData(market: string) {
  return readSessionValue<AssetChartData>(getChartCacheKey(market));
}

export function writeCachedChartData(market: string, value: AssetChartData) {
  writeSessionValue(getChartCacheKey(market), value);
}

export function clearChartCache(market?: string) {
  if (market) {
    sessionStorage.removeItem(getChartCacheKey(market));
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key && key.startsWith(CHART_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
}

export function readFavorites() {
  const favorites = readSessionValue<string[]>(FAVORITES_KEY);
  return Array.isArray(favorites) ? favorites : [];
}

export function writeFavorites(favorites: string[]) {
  writeSessionValue(FAVORITES_KEY, favorites);
}

export async function requestConditionData(conditionId: number, forceRefresh = false) {
  if (!forceRefresh) {
    const cachedData = readCachedConditionData(conditionId);
    if (cachedData) {
      return cachedData;
    }

    const inflightRequest = inflightRequests.get(conditionId);
    if (inflightRequest) {
      return inflightRequest;
    }
  }

  const requestPromise = (async () => {
    try {
      const result = await requestJson<{
        success?: boolean;
        data?: CryptoData[];
        allData?: Record<string, CryptoData[]>;
        generatedAt?: number;
      }>("/api/crypto", {
        conditionId,
        refresh: forceRefresh ? 1 : undefined,
      });

      if (!result.success) {
        throw new Error("API returned an unsuccessful response");
      }

      const updatedAt = new Date(result.generatedAt ?? Date.now()).toLocaleTimeString();
      const allData = result.allData as Record<string, CryptoData[]> | undefined;

      if (allData) {
        Object.entries(allData).forEach(([key, value]) => {
          writeCachedConditionData(Number(key), value, updatedAt);
        });
      }

      const selectedData = allData?.[String(conditionId)] ?? result.data;
      if (!selectedData) {
        throw new Error("API response is missing condition data");
      }

      writeCachedConditionData(conditionId, selectedData, updatedAt);

      return {
        data: selectedData,
        lastUpdated: updatedAt,
      };
    } catch (error) {
      console.error("Failed to fetch condition data:", error);
      return null;
    } finally {
      if (!forceRefresh) {
        inflightRequests.delete(conditionId);
      }
    }
  })();

  if (!forceRefresh) {
    inflightRequests.set(conditionId, requestPromise);
  }

  return requestPromise;
}

export async function requestAssetChartData(market: string, forceRefresh = false, frameScope: ChartFrameScope = "all") {
  const shouldReuseCached = !forceRefresh && frameScope === "all";

  if (shouldReuseCached) {
    const cachedData = readCachedChartData(market);
    if (cachedData) {
      return cachedData;
    }

    const inflightRequest = inflightChartRequests.get(market);
    if (inflightRequest) {
      return inflightRequest;
    }
  }

  const requestPromise = (async () => {
    try {
      const result = await requestJson<{ success?: boolean } & AssetChartData>("/api/chart", {
        market,
        refresh: forceRefresh ? 1 : undefined,
        frame: frameScope !== "all" ? frameScope : undefined,
      });

      if (!result.success) {
        throw new Error("Chart API returned an unsuccessful response");
      }

      writeCachedChartData(market, result);
      return result;
    } catch (error) {
      console.error("Failed to fetch chart data:", error);
      return null;
    } finally {
      if (shouldReuseCached) {
        inflightChartRequests.delete(market);
      }
    }
  })();

  if (shouldReuseCached) {
    inflightChartRequests.set(market, requestPromise);
  }

  return requestPromise;
}

export function filterAndSortData(data: CryptoData[], searchTerm: string, sortConfig: SortConfig) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredData = data.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }

    return (
      item.korean_name.toLowerCase().includes(normalizedSearch) ||
      item.english_name.toLowerCase().includes(normalizedSearch) ||
      item.market.toLowerCase().includes(normalizedSearch)
    );
  });

  if (!sortConfig.key) {
    return filteredData;
  }

  return [...filteredData].sort((leftItem, rightItem) => {
    const leftValue = leftItem[sortConfig.key];
    const rightValue = rightItem[sortConfig.key];

    if (leftValue < rightValue) {
      return sortConfig.direction === "asc" ? -1 : 1;
    }

    if (leftValue > rightValue) {
      return sortConfig.direction === "asc" ? 1 : -1;
    }

    return 0;
  });
}

export function formatVolume(volume: number) {
  return `₩${(volume / 100000000).toFixed(1)}B`;
}
