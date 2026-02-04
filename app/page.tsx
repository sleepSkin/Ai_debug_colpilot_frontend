"use client";

import { useMemo, useState } from "react";

import ResultCard from "../components/ResultCard";
import type { DebugRequest, DebugResponse } from "../lib/types";

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    setLoading(true);
    setErr(null);
    setResult(null);

    try {
      const payload: DebugRequest = { input };
      const resp = await fetch("/api/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      if (!resp.ok) {
        setErr(`HTTP ${resp.status}: ${text}`);
        return;
      }
      setResult(JSON.parse(text));
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = useMemo(() => {
    if (loading) return "Analyzing";
    if (err) return "Needs attention";
    if (result) return "Analysis ready";
    return "Idle";
  }, [err, loading, result]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 20px 40px",
        fontFamily: '"Sora", "Space Grotesk", "Segoe UI", sans-serif',
        color: "#0f172a",
        background:
          "radial-gradient(circle at 5% 0%, rgba(109, 94, 252, 0.18), transparent 45%), radial-gradient(circle at 95% 10%, rgba(109, 94, 252, 0.12), transparent 35%), #f6f7fb",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: "10% 60% auto auto",
            width: 240,
            height: 240,
            background: "rgba(109, 94, 252, 0.15)",
            filter: "blur(90px)",
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />
        <header style={{ marginBottom: 24 }}>
          <p
            style={{
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: 4,
              fontSize: 12,
              color: "rgba(15, 23, 42, 0.6)",
            }}
          >
            AI Debug Copilot
          </p>
          <h1 style={{ margin: "10px 0 12px", fontSize: 36, letterSpacing: -0.5 }}>
            Debug signal, structured.
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: loading ? "rgba(250, 204, 21, 0.15)" : "rgba(109, 94, 252, 0.15)",
                border: "1px solid rgba(109, 94, 252, 0.2)",
                fontSize: 12,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {statusLabel}
            </span>
            {result?.error_type && (
              <span style={{ fontSize: 14, color: "#475569" }}>
                Error Type: <strong>{result.error_type}</strong>
              </span>
            )}
          </div>
        </header>

        <section
          className="layout-grid"
          style={{
            display: "grid",
            gap: 24,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 18,
              border: "1px solid #e5e7eb",
              padding: 20,
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
              minHeight: 480,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 22 }}>Context</h2>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 8, fontSize: 14 }}>
                Input
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    "支持一次性粘贴报错/堆栈/代码"
                  }
                  rows={10}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#0f172a",
                    fontFamily: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={onSubmit}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(109, 94, 252, 0.6)",
                  background: loading ? "#edeaff" : "linear-gradient(120deg, #6d5efc, #8b7bff)",
                  color: loading ? "#6b5cff" : "#ffffff",
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Analyzing..." : "Analyze"}
              </button>
              <span style={{ fontSize: 12, color: "rgba(71, 85, 105, 0.8)", maxWidth: 220 }}>
                支持一次性粘贴。系统会自动提取语言、堆栈与代码片段。
              </span>
            </div>

            {err && (
              <pre
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(248, 113, 113, 0.15)",
                  border: "1px solid rgba(248, 113, 113, 0.4)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {err}
              </pre>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
              alignContent: "start",
            }}
          >
            {result ? (
              <>
                <section
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: 2.2,
                      color: "rgba(71, 85, 105, 0.8)",
                    }}
                  >
                    Error Type
                  </p>
                  <h2 style={{ margin: "8px 0 0", fontSize: 24 }}>
                    {result.error_type || "Unknown"}
                  </h2>
                </section>
                <ResultCard title="Root Cause" items={result.root_cause ?? []} />
                <ResultCard title="Fix Suggestions" items={result.fix_suggestions ?? []} />
                <ResultCard title="Prevention" items={result.prevention ?? []} />
                <section
                  style={{
                    background: "#ffffff",
                    borderRadius: 16,
                    border: "1px solid #e5e7eb",
                    padding: 16,
                  }}
                >
                  <details style={{ color: "#0f172a" }}>
                    <summary style={{ cursor: "pointer", fontSize: 14, letterSpacing: 0.6 }}>
                      raw_model_output
                    </summary>
                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!result.raw_model_output) return;
                          await navigator.clipboard.writeText(result.raw_model_output);
                        }}
                        style={{
                          borderRadius: 999,
                          border: "1px solid #d8d5ff",
                          padding: "6px 12px",
                          background: "#f2efff",
                          color: "#5b4bff",
                          cursor: "pointer",
                          fontSize: 12,
                          textTransform: "uppercase",
                          letterSpacing: 1.2,
                          marginBottom: 10,
                        }}
                      >
                        Copy
                      </button>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontSize: 13,
                          background: "#f8fafc",
                          padding: 12,
                          borderRadius: 12,
                        }}
                      >
                        {result.raw_model_output ?? "No raw output returned."}
                      </pre>
                    </div>
                  </details>
                </section>
              </>
            ) : (
              <section
                style={{
                  padding: 20,
                  borderRadius: 18,
                  border: "1px dashed rgba(109, 94, 252, 0.3)",
                  color: "rgba(71, 85, 105, 0.8)",
                  background: "rgba(255, 255, 255, 0.7)",
                }}
              >
                Run Analyze to see structured findings, fixes, and prevention steps.
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
