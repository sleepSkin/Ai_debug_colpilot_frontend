import type { DebugResponse } from "./types";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

export function getSessionIdFromResponse(
  response: Response,
  payload: DebugResponse | null
): string | null {
  const fromHeader = response.headers.get("X-Session-Id");
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  if (payload?.sessionId && payload.sessionId.trim()) return payload.sessionId.trim();
  return null;
}

export function getRoundIndexFromResponse(
  response: Response,
  payload: DebugResponse | null
): number | null {
  const fromHeader = parsePositiveInt(response.headers.get("X-Round-Index"));
  if (fromHeader) return fromHeader;
  return parsePositiveInt(
    typeof payload?.meta?.roundIndex === "number" ? String(payload.meta.roundIndex) : null
  );
}

export function buildInputPreview(rawInput: string, maxLength = 80): string {
  const normalized = rawInput.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}
