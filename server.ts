import { useEffect, useState } from "react";

export default function App() {
  const [conditionId, setConditionId] = useState(1);
  const [rsi, setRsi] = useState(50);
  const [monthlyMin, setMonthlyMin] = useState(0); // 0 = 제한 없음
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const fetchFiltered = async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      params.set("conditionId", String(conditionId));
      params.set("rsi", String(rsi));
      params.set("monthlyMin", String(monthlyMin));

      const res = await fetch(`/api/crypto?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      setMeta({
        snapshotUpdatedAt: json.snapshotUpdatedAt,
        count: json.count,
        downloadUrl: json.downloadUrl,
      });
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const refreshSnapshot = async () => {
    setRefreshing(true);
    setErr("");
    try {
      const res = await fetch(`/api/crypto/refresh`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Refresh failed");
      // 리프레시 후 자동 재조회
      await fetchFiltered();
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setRefreshing(false);
    }
  };

  // 최초 1회 로드
  useEffect(() => {
    fetchFiltered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2>Crypto Screener</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Condition
          <select
            value={conditionId}
            onChange={(e) => setConditionId(Number(e.target.value))}
            style={{ marginLeft: 8 }}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>

        <label>
          RSI(>=)
          <input
            type="number"
            value={rsi}
            min={0}
            max={100}
            step={1}
            onChange={(e) => setRsi(Number(e.target.value))}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>

        <label>
          월봉 최소개수(>=)
          <input
            type="number"
            value={monthlyMin}
            min={0}
            step={1}
            onChange={(e) => setMonthlyMin(Number(e.target.value))}
            style={{ marginLeft: 8, width: 80 }}
          />
          <span style={{ marginLeft: 6, color: "#666" }}>(0이면 제한 없음)</span>
        </label>

        <button onClick={fetchFiltered} disabled={loading || refreshing}>
          {loading ? "조회중..." : "필터 적용"}
        </button>

        <button onClick={refreshSnapshot} disabled={loading || refreshing}>
          {refreshing ? "리프레시중..." : "데이터 리프레시"}
        </button>
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      {meta && (
        <div style={{ marginTop: 12, color: "#444" }}>
          <div>Snapshot: {meta.snapshotUpdatedAt}</div>
          <div>Count: {meta.count}</div>
          <div>
            CSV: <a href={meta.downloadUrl}>download</a>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table cellPadding={8} style={{ borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#f3f3f3" }}>
              <th>Market</th>
              <th>Price</th>
              <th>RSI14</th>
              <th>MA20</th>
              <th>MA60</th>
              <th>MA120</th>
              <th>MA240</th>
              <th>MA120(M)</th>
              <th>MonthlyCnt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.market} style={{ borderTop: "1px solid #ddd" }}>
                <td>{r.market}</td>
                <td>{r.price}</td>
                <td>{r.rsi14?.toFixed?.(2) ?? "N/A"}</td>
                <td>{r.ma20_d?.toFixed?.(0) ?? "N/A"}</td>
                <td>{r.ma60_d?.toFixed?.(0) ?? "N/A"}</td>
                <td>{r.ma120_d?.toFixed?.(0) ?? "N/A"}</td>
                <td>{r.ma240_d?.toFixed?.(0) ?? "N/A"}</td>
                <td>{r.ma120_m?.toFixed?.(0) ?? "N/A"}</td>
                <td>{r.candle_count_m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
