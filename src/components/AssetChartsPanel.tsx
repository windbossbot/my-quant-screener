import { useEffect, useState } from "react";
import { CandlestickSeries, ColorType, createChart, LineSeries, PriceScaleMode, type Time } from "lightweight-charts";
import { BarChart3, Clock3, RefreshCw } from "lucide-react";
import type { AssetChartData, ChartCandle, ChartFrameData, ChartFrameScope, ChartFrameState, ChartLinePoint, CryptoData } from "../types";

const MOVING_AVERAGE_ORDER = ["ma20", "ma30", "ma60", "ma120", "ma240"] as const;
const MOVING_AVERAGE_LABELS: Record<(typeof MOVING_AVERAGE_ORDER)[number], string> = {
  ma20: "MA 20",
  ma30: "MA 30",
  ma60: "MA 60",
  ma120: "MA 120",
  ma240: "MA 240",
};
const MOVING_AVERAGE_COLORS: Record<(typeof MOVING_AVERAGE_ORDER)[number], string> = {
  ma20: "#DC2626",
  ma30: "#EA580C",
  ma60: "#EAB308",
  ma120: "#16A34A",
  ma240: "#2563EB",
};

function formatPrice(value: number) {
  const minimumFractionDigits = value >= 100 ? 0 : value >= 1 ? 2 : 4;
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  });
}

function mapCandles(candles: ChartCandle[]) {
  return candles.map((candle) => ({
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

function mapLineData(points: ChartLinePoint[]) {
  return points.map((point) => ({
    time: point.time as Time,
    value: point.value,
  }));
}

function usePriceChart(frame: ChartFrameData | null, element: HTMLDivElement | null) {
  useEffect(() => {
    if (!frame || !element) {
      return;
    }

    const chart = createChart(element, {
      autoSize: true,
      height: 320,
      layout: {
        background: {
          type: ColorType.Solid,
          color: "rgba(255,255,255,0)",
        },
        textColor: "rgba(20,20,20,0.72)",
        fontFamily: "Aptos, Segoe UI, Apple SD Gothic Neo, sans-serif",
      },
      grid: {
        vertLines: {
          color: "rgba(20,20,20,0.06)",
        },
        horzLines: {
          color: "rgba(20,20,20,0.06)",
        },
      },
      crosshair: {
        vertLine: {
          color: "rgba(198,90,46,0.25)",
        },
        horzLine: {
          color: "rgba(198,90,46,0.25)",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(20,20,20,0.08)",
        mode: PriceScaleMode.Logarithmic,
        scaleMargins: {
          top: 0.12,
          bottom: 0.06,
        },
      },
      timeScale: {
        borderColor: "rgba(20,20,20,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: formatPrice,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#C65A2E",
      downColor: "#295A52",
      wickUpColor: "#C65A2E",
      wickDownColor: "#295A52",
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    candleSeries.setData(mapCandles(frame.candles));

    MOVING_AVERAGE_ORDER.forEach((key) => {
      const seriesData = frame.movingAverages[key];
      if (!seriesData || seriesData.length === 0) {
        return;
      }

      const lineSeries = chart.addSeries(LineSeries, {
        color: MOVING_AVERAGE_COLORS[key],
        lineWidth: key === "ma120" || key === "ma240" ? 2 : 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      lineSeries.setData(mapLineData(seriesData));
    });

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [frame, element]);
}

function ChartFrameCard({
  title,
  frameState,
  onReload,
}: {
  title: string;
  frameState: ChartFrameState;
  onReload: () => void;
}) {
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  usePriceChart(frameState.frame, containerElement);

  return (
    <div className="rounded-[28px] border border-[#141414]/10 bg-white/78 p-4 shadow-[0_18px_60px_rgba(20,20,20,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-xl font-semibold tracking-[-0.04em] text-[#141414]">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {frameState.stale && (
            <div className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              Cached
            </div>
          )}
          <button
            type="button"
            onClick={onReload}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#141414]/10 bg-[#F8F2E8] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141414]/62 transition-colors hover:border-[#141414]/30 hover:bg-white"
          >
            <RefreshCw className="h-3 w-3" />
            재시도
          </button>
        </div>
      </div>

      {frameState.error && (
        <div className={`mb-4 rounded-[18px] px-4 py-3 text-sm leading-6 ${
          frameState.frame ? "border border-amber-500/20 bg-amber-500/10 text-amber-800" : "border border-rose-500/25 bg-rose-500/10 text-rose-700"
        }`}>
          {frameState.error}
        </div>
      )}

      {frameState.frame ? (
        <div
          ref={setContainerElement}
          className="h-[300px] w-full rounded-[22px] border border-[#141414]/8 bg-[linear-gradient(180deg,_rgba(248,242,232,0.9),_rgba(255,255,255,0.98))]"
        />
      ) : (
        <div className="flex h-[300px] items-center justify-center rounded-[22px] border border-dashed border-[#141414]/14 bg-[linear-gradient(180deg,_rgba(248,242,232,0.9),_rgba(255,255,255,0.98))] px-6 text-center text-sm leading-7 text-[#141414]/58">
          차트 데이터를 아직 가져오지 못했습니다. 재시도로 다시 확인해 주세요.
        </div>
      )}
    </div>
  );
}

export function AssetChartsPanel({
  selectedAsset,
  chartData,
  loading,
  errorMessage,
  onReload,
  onReloadFrame,
}: {
  selectedAsset: CryptoData | null;
  chartData: AssetChartData | null;
  loading: boolean;
  errorMessage: string | null;
  onReload: () => void;
  onReloadFrame: (frame: ChartFrameScope) => void;
}) {
  if (!selectedAsset) {
    return (
      <div className="rounded-[32px] border border-dashed border-[#141414]/16 bg-[#FBF8F2]/75 p-6 text-[#141414]/62">
        <div className="flex items-center gap-3 text-[#141414]/78">
          <BarChart3 className="h-5 w-5" />
          <span className="text-lg font-semibold tracking-[-0.03em]">차트 패널</span>
        </div>
        <div className="mt-3 text-sm leading-7">
          결과 목록에서 종목을 누르면 같은 화면 안에서 일봉과 4시간봉 차트를 바로 볼 수 있습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[32px] border border-[#141414]/10 bg-[#FBF8F2]/88 p-5 shadow-[0_18px_60px_rgba(20,20,20,0.06)] backdrop-blur">
      <div className="mb-5 flex flex-col gap-4 border-b border-[#141414]/8 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#141414]/44">
            Selected Asset
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#141414]">
            {selectedAsset.market.split("/")[0]}
          </div>
          <div className="mt-1 text-sm text-[#141414]/58">
            {selectedAsset.korean_name}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#141414]/10 bg-white/75 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#141414]/55">
            <Clock3 className="h-3.5 w-3.5" />
            {chartData ? new Date(chartData.generatedAt).toLocaleTimeString() : "Loading"}
          </div>
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#141414] bg-[#141414] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#F8F2E8] transition-all hover:border-[#C65A2E] hover:bg-[#C65A2E] disabled:cursor-wait disabled:opacity-55"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            차트 새로고침
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-5 rounded-[22px] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      {loading && !chartData ? (
        <div className="grid gap-4">
          {[1, 2].map((index) => (
            <div
              key={index}
              className="h-[360px] animate-pulse rounded-[28px] border border-[#141414]/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.78),_rgba(248,242,232,0.82))]"
            />
          ))}
        </div>
      ) : !chartData ? (
        <div className="rounded-[26px] border border-dashed border-[#141414]/14 bg-white/75 px-5 py-8 text-center text-sm leading-7 text-[#141414]/58">
          선택한 종목의 차트를 아직 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-[24px] border border-[#141414]/8 bg-white/72 px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#141414]/10 bg-[#F8F2E8] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141414]/58">
                Log Scale
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141414]/38">
                공통 이평선 설정
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {MOVING_AVERAGE_ORDER.map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-2 rounded-full border border-[#141414]/8 bg-[#F8F2E8] px-3 py-1 text-[11px] font-semibold text-[#141414]/72"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MOVING_AVERAGE_COLORS[key] }} />
                  {MOVING_AVERAGE_LABELS[key]}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-5">
            <ChartFrameCard title="일봉 차트" frameState={chartData.daily} onReload={() => onReloadFrame("daily")} />
            <ChartFrameCard title="4시간봉 차트" frameState={chartData.fourHour} onReload={() => onReloadFrame("fourHour")} />
          </div>
        </>
      )}
    </div>
  );
}
