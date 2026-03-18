import Link from "next/link";

import StatusBadge from "./StatusBadge";
import type { SessionListItem } from "@/lib/session-types";

/**
 * 这个文件的作用：
 * - 渲染会话列表中的单个卡片。
 * - 每个卡片可点击跳转到 `/sessions/[id]` 详情页。
 */

type SessionListItemProps = {
  /** 单条会话数据 */
  item: SessionListItem;
};

/**
 * 将 ISO 时间字符串格式化为更易读文本。
 * 若时间为空或非法，统一显示 "-"，避免 UI 报错。
 */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function SessionListItemCard({ item }: SessionListItemProps) {
  return (
    <Link
      href={`/sessions/${item.id}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <article
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: 14,
          background: "#ffffff",
          boxShadow: "0 4px 12px rgba(15, 23, 42, 0.06)",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>{item.title || "Untitled Session"}</h3>
          <StatusBadge status={item.lastStatus} />
        </header>

        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#475569" }}>
          <strong>ID:</strong> {item.id}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569" }}>
          <strong>Updated:</strong> {formatDateTime(item.updatedAt)}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569" }}>
          <strong>Last Round:</strong> {item.lastRoundIndex}
        </p>

        {item.lastErrorMessage ? (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: "#b91c1c",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "6px 8px",
            }}
          >
            <strong>Last Error:</strong> {item.lastErrorMessage}
          </p>
        ) : null}
      </article>
    </Link>
  );
}
