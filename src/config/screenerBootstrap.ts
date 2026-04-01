// Single source of truth for condition ids and user-facing labels.
// Server and client both import this file so new conditions can be added in one place.

export type ConditionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ConditionMeta = {
  id: ConditionId;
  group: "fourHour" | "daily";
  timeframe: string;
  title: string;
  description: string;
};

export const FOUR_HOUR_CONDITION_IDS: ConditionId[] = [1, 2, 3, 4];
export const DAILY_CONDITION_IDS: ConditionId[] = [5, 6, 7, 8, 9, 10];

export const CONDITIONS: ConditionMeta[] = [
  {
    id: 1,
    group: "fourHour",
    timeframe: "4시간봉",
    title: "4시간봉 20·120선 눌림",
    description: "4시간봉 현재가가 20선 대비 -1%~+5%, 120선 대비 -10%~+2% 범위에 있고, 일봉 20선 대비 -3% 이상이며 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 2,
    group: "fourHour",
    timeframe: "4시간봉",
    title: "4시간봉 정배열",
    description: "4시간봉 20선, 60선, 120선이 상승 정배열이고 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 3,
    group: "fourHour",
    timeframe: "4시간봉",
    title: "4시간봉 30·120선 눌림 + 일봉 30선 위",
    description: "4시간봉 현재가가 30선 대비 -1%~+5%, 120선 대비 -10%~+2% 범위에 있고, 일봉 30선 위에 있으며 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 4,
    group: "fourHour",
    timeframe: "4시간봉",
    title: "4시간봉 30·120선 눌림 + 일봉 20선 위",
    description: "4시간봉 현재가가 30선 대비 -1%~+5%, 120선 대비 -10%~+2% 범위에 있고, 일봉 20선 위에 있으며 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 5,
    group: "daily",
    timeframe: "일봉",
    title: "일봉 정배열",
    description: "일봉 20선, 60선, 120선이 상승 정배열인 종목",
  },
  {
    id: 6,
    group: "daily",
    timeframe: "일봉",
    title: "일봉 정배열 + 30일선 근접",
    description: "일봉 20선, 60선, 120선이 상승 정배열이고 현재가가 30일선 대비 -1%~+6% 범위에 있는 종목",
  },
  {
    id: 7,
    group: "daily",
    timeframe: "일봉",
    title: "일봉 120일선 근접",
    description: "일봉 현재가가 120일선 대비 -1%~+7% 범위에 있는 종목",
  },
  {
    id: 8,
    group: "daily",
    timeframe: "일봉",
    title: "일봉 120일선 ±10%",
    description: "일봉 현재가가 120일선 대비 -10%~+10% 범위에 있는 종목",
  },
  {
    id: 9,
    group: "daily",
    timeframe: "주봉",
    title: "주봉 정배열 + 일봉 20선 근접",
    description: "주봉 20선, 60선, 120선이 상승 정배열이고 현재가가 일봉 20일선 위아래 5% 이내인 종목",
  },
  {
    id: 10,
    group: "daily",
    timeframe: "월봉",
    title: "월봉 정배열 + 일봉 20선 근접",
    description: "월봉 20선, 60선, 120선이 상승 정배열이고 현재가가 일봉 20일선 위아래 5% 이내인 종목",
  },
];

export const ALL_CONDITION_IDS: ConditionId[] = CONDITIONS.map((condition) => condition.id);
export const DEFAULT_CONDITION_ID: ConditionId = CONDITIONS[0].id;

export const SCREENER_BOOTSTRAP = {
  title: "Bithumb Quant Screener",
  entryFile: "src/config/screenerBootstrap.ts",
  referenceDoc: "docs/condition-reference.md",
  printScriptCommand: "npm run conditions:print",
  defaultConditionId: DEFAULT_CONDITION_ID,
  groups: {
    fourHour: FOUR_HOUR_CONDITION_IDS,
    daily: DAILY_CONDITION_IDS,
  },
  conditions: CONDITIONS,
} as const;
