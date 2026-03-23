export type ConditionMeta = {
  id: number;
  timeframe: string;
  title: string;
  description: string;
};

export const CONDITIONS: ConditionMeta[] = [
  {
    id: 1,
    timeframe: "4시간봉",
    title: "4시간봉 20·120선 눌림",
    description: "4시간봉 현재가가 20선 대비 -1%~+5%, 120선 대비 -10%~+2% 범위에 있고, 일봉 20선 대비 -3% 이상이며 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 2,
    timeframe: "4시간봉",
    title: "4시간봉 정배열",
    description: "4시간봉 20선, 60선, 120선이 상승 정배열이고 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 3,
    timeframe: "4시간봉",
    title: "4시간봉 30·120선 눌림 + 일봉 30선 위",
    description: "4시간봉 현재가가 30선 대비 -1%~+5%, 120선 대비 -10%~+2% 범위에 있고, 일봉 30선 위에 있으며 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 4,
    timeframe: "4시간봉",
    title: "4시간봉 30·120선 눌림 + 일봉 20선 위",
    description: "4시간봉 현재가가 30선 대비 -1%~+5%, 120선 대비 -10%~+2% 범위에 있고, 일봉 20선 위에 있으며 상위 매수 10호가 누적금액이 1억 미만인 종목",
  },
  {
    id: 5,
    timeframe: "일봉",
    title: "일봉 정배열",
    description: "일봉 20선, 60선, 120선이 상승 정배열인 종목",
  },
  {
    id: 6,
    timeframe: "일봉",
    title: "일봉 정배열 + 30일선 근접",
    description: "일봉 20선, 60선, 120선이 상승 정배열이고 현재가가 30일선 대비 -1%~+6% 범위에 있는 종목",
  },
  {
    id: 7,
    timeframe: "일봉",
    title: "일봉 120일선 근접",
    description: "일봉 현재가가 120일선 대비 -1%~+7% 범위에 있는 종목",
  },
  {
    id: 8,
    timeframe: "주봉",
    title: "주봉 정배열 + 일봉 20선 근접",
    description: "주봉 20선, 60선, 120선이 상승 정배열이고 현재가가 일봉 20일선 위아래 5% 이내인 종목",
  },
  {
    id: 9,
    timeframe: "월봉",
    title: "월봉 정배열 + 일봉 20선 근접",
    description: "월봉 20선, 60선, 120선이 상승 정배열이고 현재가가 일봉 20일선 위아래 5% 이내인 종목",
  },
];
