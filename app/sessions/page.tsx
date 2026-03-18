"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import SessionListItemCard from "@/components/SessionListItem";
import { getSessionList } from "@/lib/session-api";
import type { SessionListItem } from "@/lib/session-types";

/**
 * 这个文件的作用：
 * - 提供 Session 列表页（/sessions）。
 * - 页面加载时调用 GET /api/sessions。
 * - 覆盖 loading / empty / error 三种基础状态。
 */
export default function SessionsPage() {
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSessions() {
      setLoading(true);
      setError(null);

      try {
        const data = await getSessionList();
        if (!active) return;
        setItems(data);
      } catch (err: unknown) {
        if (!active) return;
        setError(String((err as Error)?.message ?? err));
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void loadSessions();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 16px 40px",
        background:
          "radial-gradient(circle at 10% 0%, rgba(59, 130, 246, 0.15), transparent 42%), #f8fafc",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, color: "#0f172a" }}>Sessions</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
              Session history for replay and debugging trace.
            </p>
          </div>
          <Link href="/" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", alignSelf: "center" }}>
            Back to Debug
          </Link>
        </header>

        {loading ? <p style={{ color: "#334155" }}>Loading sessions...</p> : null}

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
            Failed to load sessions: {error}
          </p>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <p
            style={{
              color: "#475569",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            No sessions yet.
          </p>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <section style={{ display: "grid", gap: 10 }}>
            {items.map((item) => (
              <SessionListItemCard key={item.id} item={item} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
