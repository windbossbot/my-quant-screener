export type EntryProfile = {
  id: string;
  title: string;
  sourceProject: string;
  sourceConfigPath: string;
  sourceStatusPath: string;
  sourceStatePath: string;
  summary: string;
  transferredSignals: string[];
  omittedSignals: string[];
  excludedSymbols: readonly string[];
  minPriceChangePct: number;
  min24hNotionalVolumeKrw: number;
  minAverage4hNotionalVolumeKrw: number;
  average4hNotionalVolumeLookbackBars: number;
  currentTouchDailyMaPeriod: number;
  dailyMaEntryTolerancePct: number;
  ma20UpperMultiplier: number;
  longMaUpperMultiplier: number;
  recentVolumeInflowLookbackDays: number;
  recentVolumeInflowMinVolumeRatio: number;
  recentVolumeInflowBaselineDays: number;
};

export const ACTIVE_ENTRY_PROFILE: EntryProfile = {
  id: "perpDexLiveMaTouchRrSpotProxy",
  title: "perpDex live MA20 touch proxy",
  sourceProject: "perpDex_my",
  sourceConfigPath: "C:\\Users\\KGWPC\\workspace\\perpDex_my\\config.hyperliquid.live.44usd.2pos.relaxed.json",
  sourceStatusPath: "C:\\Users\\KGWPC\\workspace\\perpDex_my\\runtime\\status.hyperliquid.live.44usd.2pos.relaxed.json",
  sourceStatePath: "C:\\Users\\KGWPC\\workspace\\perpDex_my\\runtime\\state.hyperliquid.live.44usd.2pos.relaxed.json",
  summary: "Hyperliquid live ma_touch_rr 진입 조건에서 스팟 스크리너로 옮길 수 있는 현재 4시간봉 1일 MA20 터치형 신호만 추린 프록시 조건",
  transferredSignals: [
    "현재 4시간봉 안에서 1일 MA20 터치",
    "현재가가 1일 MA20 위",
    "4시간 MA20 대비 -1%~+8% 엔벨로프",
    "4시간 MA120 또는 MA240 대비 -10%~+4% 엔벨로프",
    "최근 30일 안의 거래량 유입 양봉",
    "24시간 상승률 +1% 이상",
    "메이저 제외",
  ],
  omittedSignals: [
    "open interest",
    "funding rate",
    "perp pending order / sizing / exit",
    "Hyperliquid 전용 상태값",
  ],
  excludedSymbols: ["BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "DOGE", "ADA", "BCH", "HYPE"],
  minPriceChangePct: 1.0,
  min24hNotionalVolumeKrw: 3_000_000_000,
  minAverage4hNotionalVolumeKrw: 600_000_000,
  average4hNotionalVolumeLookbackBars: 20,
  currentTouchDailyMaPeriod: 20,
  dailyMaEntryTolerancePct: 0.0,
  ma20UpperMultiplier: 1.08,
  longMaUpperMultiplier: 1.04,
  recentVolumeInflowLookbackDays: 30,
  recentVolumeInflowMinVolumeRatio: 1.7,
  recentVolumeInflowBaselineDays: 20,
};

export const ENTRY_BOOTSTRAP = {
  title: "Quant Screener Entry Bootstrap",
  entryFile: "src/config/entryBootstrap.ts",
  printScriptCommand: "npm run entry:print",
  activeProfile: ACTIVE_ENTRY_PROFILE,
} as const;
