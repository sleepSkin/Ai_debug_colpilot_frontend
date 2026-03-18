"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import RoundCard from "@/components/RoundCard";
import StatusBadge from "@/components/StatusBadge";
import { getSessionDetail } from "@/lib/session-api";
import type { SessionDetail } from "@/lib/session-types";

/**
 * 这个文件的作用：
 * - 提供 Session 详情页（/sessions/[id]）。
 * - 页面加载时调用 GET /api/sessions/:id。
 * - 以 round 为单位展示 timeline，并支持折叠/展开。
 */

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionIdFromRoute = params?.id ? decodeURIComponent(params.id) : "";

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRoundIndexes, setExpandedRoundIndexes] = useState<number[]>([]);

  useEffect(() => {
    if (!sessionIdFromRoute) {
      setError("Missing session id in route.");
      setLoading(false);
      return;
    }

    let active = true;

    async function loadSessionDetail() {
      setLoading(true);
      setError(null);

      try {
        const data = await getSessionDetail(sessionIdFromRoute);
        if (!active) return;
        setDetail(data);

        // 默认展开最新一轮：取 roundIndex 最大值。
        const latestRoundIndex = data.rounds.length > 0 ? Math.max(...data.rounds.map((round) => round.roundIndex)) : -1;
        setExpandedRoundIndexes(latestRoundIndex > 0 ? [latestRoundIndex] : []);
      } catch (err: unknown) {
        if (!active) return;
        setError(String((err as Error)?.message ?? err));
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void loadSessionDetail();

    return () => {
      active = false;
    };
  }, [sessionIdFromRoute]);

  const sortedRounds = useMemo(() => {
    if (!detail) return [];
    return [...detail.rounds].sort((a, b) => b.roundIndex - a.roundIndex);
  }, [detail]);

  function toggleRound(roundIndex: number) {
    setExpandedRoundIndexes((prev) => {
      if (prev.includes(roundIndex)) {
        return prev.filter((value) => value !== roundIndex);
      }
      return [...prev, roundIndex];
    });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 16px 40px",
        background:
          "radial-gradient(circle at 90% 0%, rgba(16, 185, 129, 0.14), transparent 40%), #f8fafc",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 30, color: "#0f172a" }}>Session Detail</h1>
            <Link href="/sessions" style={{ color: "#2563eb", fontSize: 13, textDecoration: "none" }}>
              Back to Sessions
            </Link>
          </div>
        </header>

        {loading ? <p style={{ color: "#334155" }}>Loading session detail...</p> : null}

        {!loading && error ? (
          <p
            style={{
              color: "#991b1b",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            Failed to load session detail: {error}
          </p>
        ) : null}

        {!loading && !error && !detail ? (
          <p
            style={{
              color: "#475569",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            Session not found.
          </p>
        ) : null}

        {!loading && !error && detail ? (
          <section style={{ display: "grid", gap: 12 }}>
            <article
              style={{
                border: "1px solid #dbe4f0",
                borderRadius: 12,
                background: "#ffffff",
                padding: 14,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>
                  {detail.session.title || "Untitled Session"}
                </h2>
                <StatusBadge status={detail.session.lastStatus} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                <strong>ID:</strong> {detail.session.id}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                <strong>Created:</strong> {formatDateTime(detail.session.createdAt)}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                <strong>Updated:</strong> {formatDateTime(detail.session.updatedAt)}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                <strong>Last Round:</strong> {detail.session.lastRoundIndex}
              </p>
              {detail.session.lastErrorMessage ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "#b91c1c",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: "6px 8px",
                  }}
                >
                  <strong>Last Error:</strong> {detail.session.lastErrorMessage}
                </p>
              ) : null}
            </article>

            {sortedRounds.length === 0 ? (
              <p
                style={{
                  color: "#475569",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                No rounds in this session yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {sortedRounds.map((round) => (
                  <RoundCard
                    key={round.roundIndex}
                    round={round}
                    expanded={expandedRoundIndexes.includes(round.roundIndex)}
                    onToggle={toggleRound}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
