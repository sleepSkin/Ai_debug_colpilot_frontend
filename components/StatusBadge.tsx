/**
 * 这个文件的作用：
 * - 统一渲染状态标签（success / failed / running）。
 * - 让列表页、详情页、步骤行都使用同一套状态视觉规则。
 */

type StatusBadgeProps = {
  /** 要显示的状态文本，允许为空以兼容旧数据 */
  status: string | null | undefined;
};

/**
 * 根据状态返回对应配色。
 * 注意：这里是最小实现，只分成功/失败/运行中三种。
 */
function pickStyleByStatus(status: string | null | undefined): {
  label: string;
  color: string;
  background: string;
  border: string;
} {
  if (status === "success") {
    return {
      label: "Success",
      color: "#065f46",
      background: "#d1fae5",
      border: "#34d399",
    };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      color: "#991b1b",
      background: "#fee2e2",
      border: "#f87171",
    };
  }

  if (status === "running") {
    return {
      label: "Running",
      color: "#92400e",
      background: "#fef3c7",
      border: "#fbbf24",
    };
  }

  return {
    label: "Unknown",
    color: "#334155",
    background: "#e2e8f0",
    border: "#cbd5e1",
  };
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = pickStyleByStatus(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${style.border}`,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: style.color,
        background: style.background,
      }}
    >
      {style.label}
    </span>
  );
}
