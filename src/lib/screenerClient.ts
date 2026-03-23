import { readSessionValue, writeSessionValue } from "./session";
import type { CachedConditionData, CryptoData, SortConfig } from "../types";

const FAVORITES_KEY = "quant-screener-favorites";
const inflightRequests = new Map<number, Promise<CachedConditionData | null>>();

export const getCacheKey = (conditionId: number) => `quant-screener-condition-${conditionId}`;

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
      const refreshQuery = forceRefresh ? "&refresh=1" : "";
      const response = await fetch(`/api/crypto?conditionId=${conditionId}${refreshQuery}`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error("API returned an unsuccessful response");
      }

      const updatedAt = new Date(result.generatedAt ?? Date.now()).toLocaleTimeString();
      const allData = result.allData as Record<string, CryptoData[]> | undefined;

      if (allData) {
        Object.entries(allData).forEach(([key, value]) => {
          writeCachedConditionData(Number(key), value, updatedAt);
        });
      } else {
        writeCachedConditionData(conditionId, result.data as CryptoData[], updatedAt);
      }

      return readCachedConditionData(conditionId) ?? {
        data: result.data as CryptoData[],
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
