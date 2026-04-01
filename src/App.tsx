import { useDeferredValue, useEffect, useState } from "react";
import { Coins, Download, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { CONDITIONS, DEFAULT_CONDITION_ID, SCREENER_BOOTSTRAP } from "./conditions";
import { ConditionCard } from "./components/ConditionCard";
import { LoadingBanner } from "./components/LoadingBanner";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { ResultRow } from "./components/ResultRow";
import {
  clearConditionCache,
  filterAndSortData,
  readCachedConditionData,
  readFavorites,
  requestConditionData,
  writeFavorites,
} from "./lib/screenerClient";
import type { LoadingState, SortConfig, SortDirection, CryptoData } from "./types";

function SortButton({
  label,
  column,
  sortConfig,
  onSort,
}: {
  label: string;
  column: keyof CryptoData;
  sortConfig: SortConfig;
  onSort: (key: keyof CryptoData) => void;
}) {
  const isActive = sortConfig.key === column;

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="col-header col-span-2 cursor-pointer text-right transition-opacity hover:opacity-100"
    >
      {label}{" "}
      {isActive ? (
        sortConfig.direction === "asc" ? <TrendingUp className="inline-block h-3 w-3" /> : <TrendingDown className="inline-block h-3 w-3" />
      ) : (
        <span className="inline-block h-3 w-3 opacity-20" />
      )}
    </button>
  );
}

export default function App() {
  const [data, setData] = useState<CryptoData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondition, setSelectedCondition] = useState(DEFAULT_CONDITION_ID);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: "desc",
  });

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const selectedConditionMeta = CONDITIONS.find((condition) => condition.id === selectedCondition) ?? CONDITIONS[0];
  const isLoading = loadingState !== "idle";

  const fetchData = async (forceRefresh = false) => {
    setErrorMessage(null);

    if (!forceRefresh) {
      const cachedData = readCachedConditionData(selectedCondition);
      if (cachedData) {
        setData(cachedData.data);
        setLastUpdated(cachedData.lastUpdated);
        return;
      }
    }

    setLoadingState(forceRefresh ? "refreshing" : "loading");

    try {
      const result = await requestConditionData(selectedCondition, forceRefresh);
      if (!result) {
        setErrorMessage("조건 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      setData(result.data);
      setLastUpdated(result.lastUpdated);
    } finally {
      setLoadingState("idle");
    }
  };

  useEffect(() => {
    void fetchData();
  }, [selectedCondition]);

  useEffect(() => {
    setFavorites(readFavorites());
  }, []);

  const handleReload = () => {
    clearConditionCache(CONDITIONS.map((condition) => condition.id));
    void fetchData(true);
  };

  const handleSort = (key: keyof CryptoData) => {
    const nextDirection: SortDirection =
      sortConfig.key === key && sortConfig.direction === "desc" ? "asc" : "desc";
    setSortConfig({ key, direction: nextDirection });
  };

  const toggleFavorite = (market: string) => {
    const nextFavorites = favorites.includes(market)
      ? favorites.filter((favorite) => favorite !== market)
      : [...favorites, market];

    setFavorites(nextFavorites);
    writeFavorites(nextFavorites);
  };

  const sortedData = filterAndSortData(data, deferredSearchTerm, sortConfig);
  const favoriteItems = sortedData.filter((item) => favorites.includes(item.market));
  const otherItems = sortedData.filter((item) => !favorites.includes(item.market));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(214,141,69,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(41,90,82,0.16),_transparent_24%),linear-gradient(180deg,_#F5EBDD_0%,_#EFE5D7_48%,_#E9DFD2_100%)] px-4 py-6 text-[#141414] md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="relative overflow-hidden rounded-[36px] border border-[#141414]/10 bg-[#141414] px-6 py-7 text-[#F8F2E8] shadow-[0_30px_120px_rgba(20,20,20,0.22)] md:px-8 md:py-8">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(214,141,69,0.35),_transparent_45%)] opacity-90" />
          <div className="absolute -left-16 top-8 h-32 w-32 rounded-full bg-[#C65A2E]/20 blur-3xl" />
          <div className="absolute right-12 top-12 h-40 w-40 rounded-full bg-[#295A52]/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                  <Coins className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/60">
                  {SCREENER_BOOTSTRAP.title}
                </span>
              </div>

              <h1 className="text-4xl font-semibold leading-none tracking-[-0.06em] md:text-6xl">
                Quant Screener
              </h1>
            </div>

            <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/52">
                Last Sync
              </div>
              <div className="mt-1 text-sm font-semibold tracking-[0.01em] text-white/88">
                {lastUpdated || "Never"}
              </div>
            </div>
          </div>
        </header>

        <main className="mt-8 grid gap-8 xl:grid-cols-[0.95fr_1.65fr]">
          <section className="space-y-6">
            <div className="rounded-[32px] border border-[#141414]/10 bg-[#FBF8F2]/88 p-5 shadow-[0_18px_60px_rgba(20,20,20,0.06)] backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold tracking-[-0.04em]">
                    {selectedConditionMeta.title}
                  </div>
                </div>
                <div className="rounded-full border border-[#141414]/12 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#141414]/55">
                  {selectedConditionMeta.timeframe}
                </div>
              </div>

              <div className="text-sm leading-7 text-[#141414]/68">
                {selectedConditionMeta.description}
              </div>

              <div className="mt-5 rounded-[22px] border border-[#141414]/8 bg-white/70 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#141414]/44">
                  Last Sync
                </div>
                <div className="mt-1 text-lg font-semibold tracking-[-0.03em]">
                  {lastUpdated || "Never"}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              {CONDITIONS.map((condition) => (
                <ConditionCard
                  key={condition.id}
                  condition={condition}
                  isActive={selectedCondition === condition.id}
                  onSelect={setSelectedCondition}
                />
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <AnimatePresence mode="wait">
              <LoadingBanner
                key={loadingState}
                loadingState={loadingState}
                selectedCondition={selectedConditionMeta}
                hasData={data.length > 0}
              />
            </AnimatePresence>

            {errorMessage && (
              <div className="rounded-[28px] border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-700">
                {errorMessage}
              </div>
            )}

            <div className="rounded-[32px] border border-[#141414]/10 bg-[#FBF8F2]/88 p-5 shadow-[0_18px_60px_rgba(20,20,20,0.06)] backdrop-blur">
              <div className="flex flex-col gap-4 border-b border-[#141414]/8 pb-5 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-1 flex-col gap-4">
                  <div className="relative max-w-xl">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#141414]/35" />
                    <input
                      type="text"
                      placeholder="이름, 티커, 마켓으로 빠르게 찾기"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="w-full rounded-full border border-[#141414]/10 bg-white/80 py-3 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-[#141414]/35 focus:border-[#141414]/30 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleReload}
                    disabled={isLoading}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-[#141414] bg-[#141414] px-5 py-3 text-[#F8F2E8] transition-all hover:bg-[#C65A2E] hover:border-[#C65A2E] disabled:cursor-wait disabled:opacity-55"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    <span className="text-sm font-semibold uppercase tracking-[0.16em]">Reload</span>
                  </button>
                  <a
                    href="/screener_result.csv"
                    download
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-[#141414]/14 bg-white/75 px-5 py-3 text-[#141414] transition-all hover:border-[#141414]/35 hover:bg-white"
                  >
                    <Download className="h-4 w-4" />
                    <span className="text-sm font-semibold uppercase tracking-[0.16em]">Export CSV</span>
                  </a>
                </div>
              </div>

              {favoriteItems.length > 0 && (
                <div className="mt-5 rounded-[26px] border border-[#141414]/8 bg-white/65 p-4">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#141414]/44">
                    Favorites In This Session
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {favoriteItems.map((item) => (
                      <button
                        key={item.market}
                        type="button"
                        onClick={() => setSearchTerm(item.korean_name)}
                        className="cursor-pointer rounded-full border border-[#141414]/10 bg-[#F8F2E8] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[#141414] hover:text-[#F8F2E8]"
                      >
                        {item.korean_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {isLoading && data.length === 0 ? (
              <LoadingSkeleton />
            ) : (
              <div className="overflow-hidden rounded-[32px] border border-[#141414]/10 bg-[#FBF8F2]/92 shadow-[0_18px_60px_rgba(20,20,20,0.06)]">
                <div className="grid grid-cols-12 gap-4 border-b border-[#141414]/8 px-5 py-4">
                  <div className="col-header col-span-1">#</div>
                  <div className="col-header col-span-4">Asset</div>
                  <SortButton label="Price (KRW)" column="price" sortConfig={sortConfig} onSort={handleSort} />
                  <SortButton label="24h Change" column="change" sortConfig={sortConfig} onSort={handleSort} />
                  <button
                    type="button"
                    onClick={() => handleSort("volume")}
                    className="col-header col-span-3 cursor-pointer text-right transition-opacity hover:opacity-100"
                  >
                    Volume (24h){" "}
                    {sortConfig.key === "volume" ? (
                      sortConfig.direction === "asc" ? <TrendingUp className="inline-block h-3 w-3" /> : <TrendingDown className="inline-block h-3 w-3" />
                    ) : (
                      <span className="inline-block h-3 w-3 opacity-20" />
                    )}
                  </button>
                </div>

                <div className="divide-y divide-[#141414]/8">
                  <AnimatePresence mode="popLayout">
                    {favoriteItems.map((item, index) => (
                      <ResultRow
                        key={item.market}
                        item={item}
                        index={index}
                        highlighted
                        isFavorite={favorites.includes(item.market)}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                    {otherItems.map((item, index) => (
                      <ResultRow
                        key={item.market}
                        item={item}
                        index={favoriteItems.length + index}
                        highlighted={false}
                        isFavorite={favorites.includes(item.market)}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </AnimatePresence>

                  {sortedData.length === 0 && !isLoading && (
                    <div className="px-6 py-20 text-center">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#141414]/36">
                        Empty Result
                      </div>
                      <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#141414]/72">
                        조건에 맞는 종목이 없습니다.
                      </div>
                      <div className="mt-3 text-sm leading-7 text-[#141414]/52">
                        검색어를 비우거나 다른 조건으로 전환해 보세요.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .col-header {
              font-family: 'Aptos', 'Segoe UI', sans-serif;
              font-size: 11px;
              font-weight: 700;
              opacity: 0.5;
              text-transform: uppercase;
              letter-spacing: 0.14em;
            }
            .data-value {
              font-family: 'Consolas', 'Courier New', monospace;
              letter-spacing: -0.02em;
            }
          `,
        }}
      />
    </div>
  );
}
