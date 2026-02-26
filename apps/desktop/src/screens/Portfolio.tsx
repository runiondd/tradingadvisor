import React, { useState, useCallback, useEffect } from "react";

interface Position {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  positionType: string;
  averagePrice: number;
}

export const PortfolioScreen: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    if (typeof window.tradingApp?.invoke !== "function") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.tradingApp.invoke("portfolio:list");
      if (res.ok && Array.isArray(res.data)) setPositions(res.data as Position[]);
      else setPositions([]);
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || typeof window.tradingApp?.invoke !== "function") return;
      setImporting(true);
      setImportError(null);
      try {
        const csv = await file.text();
        const res = await window.tradingApp.invoke("portfolio:importCsv", { csv });
        if (res.ok) await loadPositions();
        else setImportError(res.error ?? "Import failed");
      } catch (err) {
        setImportError(String(err));
      } finally {
        setImporting(false);
        e.target.value = "";
      }
    },
    [loadPositions]
  );

  const hasIpc = typeof window.tradingApp?.invoke === "function";

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Portfolio</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        View positions and import via CSV for now (symbol, quantity, averagePrice). Fidelity account
        connection is planned for read-only sync.
      </p>

      {hasIpc && (
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "inline-block",
              padding: "8px 16px",
              borderRadius: 6,
              background: importing ? "#475569" : "#3b82f6",
              color: "#fff",
              cursor: importing ? "wait" : "pointer"
            }}
          >
            {importing ? "Importing…" : "Import CSV"}
            <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {importError && (
        <div style={{ padding: 12, background: "#7f1d1d", borderRadius: 8, color: "#fecaca", marginBottom: 16 }}>
          {importError}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : positions.length === 0 ? (
        <div
          style={{
            padding: 24,
            border: "1px dashed #334155",
            borderRadius: 8,
            color: "#64748b",
            textAlign: "center"
          }}
        >
          {hasIpc
            ? 'No positions. Use "Import CSV" to add positions (columns: symbol, quantity, averagePrice). Fidelity link coming later.'
            : "Run the app in Electron to view and import positions."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#94a3b8" }}>Symbol</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>Avg price</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #1e293b" }}>
                  <td style={{ padding: "8px 12px" }}>{p.symbol}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.quantity}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>${p.averagePrice.toFixed(2)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>${(p.quantity * p.averagePrice).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
