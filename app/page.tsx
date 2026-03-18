"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import ResultCard from "../components/ResultCard";
import { buildInputPreview, getRoundIndexFromResponse, getSessionIdFromResponse } from "../lib/debug-client";
import type { DebugRequest, DebugResponse, TimelineItem, TimelineRoundSource } from "../lib/types";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickStringArray(value: Record<string, unknown> | null, key: string): string[] {
  const candidate = value?.[key];
  if (!Array.isArray(candidate)) return [];
  return candidate.map((item) => String(item));
}

function pickString(value: Record<string, unknown> | null, key: string): string | null {
  const candidate = value?.[key];
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim();
  return normalized ? normalized : null;
}

function parseDebugResponse(text: string): DebugResponse | null {
  try {
    const parsed = JSON.parse(text) as DebugResponse;
    if (typeof parsed?.ok === "boolean") return parsed;
    return null;
  } catch {
    return null;
  }
}

function buildRoundLabel(roundNumber: number, roundSource: TimelineRoundSource): string {
  if (roundSource === "authoritative") {
    return `Round #${roundNumber}`;
  }
  return `Round (local) #${roundNumber}`;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [lastSubmittedRawInput, setLastSubmittedRawInput] = useState("");

  const localRoundCountersRef = useRef<Record<string, number>>({});

  async function submitDebug(mode: "analyze" | "retry") {
    const fallbackRetryInput = mode === "retry" && !input.trim() ? lastSubmittedRawInput : "";
    const requestInput = (fallbackRetryInput || input).trim();

    if (!requestInput) {
      setErr("rawInput 不能为空");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const payload: DebugRequest = {
        rawInput: requestInput,
      };

      if (currentSessionId) {
        payload.sessionId = currentSessionId;
      }

      const resp = await fetch("/api/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      const parsed = parseDebugResponse(text);
      const responseSessionId = getSessionIdFromResponse(resp, parsed) ?? currentSessionId;
      const requestId = parsed?.requestId ?? resp.headers.get("X-Request-Id") ?? crypto.randomUUID();

      if (responseSessionId) {
        setCurrentSessionId(responseSessionId);
      }

      const roundFromApi = getRoundIndexFromResponse(resp, parsed);
      const counterKey = responseSessionId ?? currentSessionId ?? "(new)";

      let roundNumber: number;
      let roundSource: TimelineRoundSource;
      if (roundFromApi) {
        roundNumber = roundFromApi;
        roundSource = "authoritative";
        localRoundCountersRef.current[counterKey] = Math.max(
          localRoundCountersRef.current[counterKey] ?? 0,
          roundFromApi
        );
      } else {
        roundNumber = (localRoundCountersRef.current[counterKey] ?? 0) + 1;
        roundSource = "local";
        localRoundCountersRef.current[counterKey] = roundNumber;
      }

      const inputPreview = buildInputPreview(requestInput, 80);

      const timelineItemBase: TimelineItem = {
        id: `${requestId}-${roundNumber}`,
        sessionId: responseSessionId ?? "(new)",
        status: parsed?.ok ? "success" : "failed",
        inputPreview,
        roundNumber,
        roundSource,
        requestId,
        createdAt: new Date().toISOString(),
      };

      if (!parsed) {
        setErr(`HTTP ${resp.status}: ${text || "Invalid JSON response"}`);
        setTimeline((prev) => [
          ...prev,
          {
            ...timelineItemBase,
            status: "failed",
            errorCode: "UNKNOWN",
            errorMessage: text || `HTTP ${resp.status}: Invalid JSON response`,
            failedStep: "PARSE",
          },
        ]);
        setResponse(null);
        setLastSubmittedRawInput(requestInput);
        return;
      }

      setResponse(parsed);
      setLastSubmittedRawInput(requestInput);

      if (!parsed.ok) {
        setErr(`${parsed.error.code}: ${parsed.error.message}`);
        setTimeline((prev) => [
          ...prev,
          {
            ...timelineItemBase,
            status: "failed",
            errorCode: parsed.error.code,
            errorMessage: parsed.error.message,
            failedStep: parsed.meta.failed_step,
          },
        ]);
        return;
      }

      const debugJson = toRecord(parsed.result.debug_result_json);
      setTimeline((prev) => [
        ...prev,
        {
          ...timelineItemBase,
          status: "success",
          successSummary: {
            errorType: pickString(debugJson, "error_type") ?? undefined,
            rootCause: pickStringArray(debugJson, "root_cause")[0],
            fixSuggestion: pickStringArray(debugJson, "fix_suggestions")[0],
          },
        },
      ]);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function onNewSession() {
    setCurrentSessionId(null);
    setTimeline([]);
    setResponse(null);
    setErr(null);
    localRoundCountersRef.current = {};
  }

  const debugJson = useMemo(() => {
    if (!response?.ok) return null;
    return toRecord(response.result.debug_result_json);
  }, [response]);

  const statusLabel = useMemo(() => {
    if (loading) return "Analyzing";
    if (err) return "Needs attention";
    if (response?.ok) return "Analysis ready";
    return "Idle";
  }, [err, loading, response]);

  const latestRoundItem = timeline[timeline.length - 1] ?? null;
  const roundDisplay = latestRoundItem
    ? buildRoundLabel(latestRoundItem.roundNumber, latestRoundItem.roundSource)
    : "-";

  const errorType = pickString(debugJson, "error_type");
  const rootCause = pickStringArray(debugJson, "root_cause");
  const fixSuggestions = pickStringArray(debugJson, "fix_suggestions");
  const prevention = pickStringArray(debugJson, "prevention");
  const rawModelOutput = pickString(debugJson, "raw_model_output");

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
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Session: {currentSessionId ?? "(new)"}
            </span>
            <span style={{ fontSize: 12, color: "#64748b" }}>Round: {roundDisplay}</span>
            {errorType && (
              <span style={{ fontSize: 14, color: "#475569" }}>
                Error Type: <strong>{errorType}</strong>
              </span>
            )}
          </div>
          <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12, color: "#64748b" }}>
            当前页 Timeline 为内存态；刷新后若会话丢失，请从历史 Session 页面查看。
          </p>
          <p style={{ marginTop: 8, marginBottom: 0 }}>
            <Link href="/sessions" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>
              Go to Session History
            </Link>
          </p>
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
                  placeholder="支持一次性粘贴报错、堆栈和代码片段"
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

            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => submitDebug("analyze")}
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
              <button
                type="button"
                onClick={() => submitDebug("retry")}
                disabled={loading || !currentSessionId}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(248, 113, 113, 0.45)",
                  background: "rgba(248, 113, 113, 0.08)",
                  color: "#b91c1c",
                  fontWeight: 600,
                  cursor: loading || !currentSessionId ? "not-allowed" : "pointer",
                }}
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onNewSession}
                disabled={loading}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                New Session
              </button>
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

            <section
              style={{
                marginTop: 16,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: 12,
              }}
            >
              <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b" }}>
                Timeline
              </p>
              {timeline.length === 0 ? (
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b" }}>暂无记录。</p>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {timeline.map((item) => (
                    <article
                      key={item.id}
                      style={{
                        borderRadius: 10,
                        border: "1px solid #dbe4f0",
                        background: "#fff",
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                        <strong>{buildRoundLabel(item.roundNumber, item.roundSource)}</strong>
                        <span>status: {item.status}</span>
                      </div>
                      <p style={{ margin: "6px 0", fontSize: 13, color: "#334155" }}>
                        input: {item.inputPreview || "(empty)"}
                      </p>
                      {item.status === "failed" ? (
                        <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>
                          {item.errorCode}: {item.errorMessage} (failed_step: {item.failedStep})
                        </p>
                      ) : (
                        <p style={{ margin: 0, fontSize: 12, color: "#0f766e" }}>
                          error_type: {item.successSummary?.errorType || "-"}; root_cause: {item.successSummary?.rootCause || "-"}; fix: {item.successSummary?.fixSuggestion || "-"}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
              alignContent: "start",
            }}
          >
            {response?.ok ? (
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
                  <h2 style={{ margin: "8px 0 0", fontSize: 24 }}>{errorType || "Unknown"}</h2>
                </section>
                <ResultCard title="Root Cause" items={rootCause} />
                <ResultCard title="Fix Suggestions" items={fixSuggestions} />
                <ResultCard title="Prevention" items={prevention} />
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
                          if (!rawModelOutput) return;
                          await navigator.clipboard.writeText(rawModelOutput);
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
                        {rawModelOutput ?? "No raw output returned."}
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
