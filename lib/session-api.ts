/**
 * 这个文件的作用：
 * - 封装 Sprint B 需要的两个读取接口请求函数：
 *   1) getSessionList()
 *   2) getSessionDetail(sessionId)
 * - 统一处理非 2xx HTTP 错误，避免页面层重复写 try/catch 细节。
 */

import type {
  RoundItemApi,
  SessionDetail,
  SessionDetailResponseApi,
  SessionListItem,
  SessionListResponseApi,
  SessionStatus,
} from "./session-types";

/**
 * ApiError 是统一的请求错误对象。
 * - status: HTTP 状态码（例如 404 / 500）
 * - message: 统一可展示错误文本
 * - detail: 服务端返回的原始文本（用于排查）
 */
export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, message: string, detail: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 将字符串安全转换为 SessionStatus。
 * 如果后端返回异常值，统一兜底为 null，避免页面错误展示。
 */
function normalizeStatus(value: string | null | undefined): SessionStatus | null {
  if (value === "success" || value === "failed" || value === "running") {
    return value;
  }
  return null;
}

/**
 * requestJson 是一个通用请求助手：
 * - 发送 fetch 请求
 * - 对非 2xx 统一抛出 ApiError
 * - 对 JSON 解析失败抛出清晰错误
 */
async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Request failed with status ${response.status}`,
      responseText || "No response body"
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch (error: unknown) {
    throw new ApiError(
      response.status,
      "Response is not valid JSON",
      String((error as Error)?.message ?? error)
    );
  }
}

/**
 * 把 `GET /api/sessions` 的原始结构（snake_case）映射为页面友好的 camelCase。
 */
function mapSessionList(data: SessionListResponseApi): SessionListItem[] {
  return data.sessions.map((item) => ({
    id: item.id,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    userId: item.user_id,
    title: item.title,
    lastStatus: normalizeStatus(item.last_status),
    lastRoundIndex: item.last_round_index,
    lastErrorMessage: item.last_error_message,
  }));
}

/**
 * 把 `GET /api/sessions/:id` 的原始结构映射为页面友好的 camelCase。
 */
function mapSessionDetail(data: SessionDetailResponseApi): SessionDetail {
  return {
    session: {
      id: data.session.id,
      createdAt: data.session.created_at,
      updatedAt: data.session.updated_at,
      userId: data.session.user_id,
      title: data.session.title,
      lastStatus: normalizeStatus(data.session.last_status),
      lastRoundIndex: data.session.last_round_index,
      lastErrorMessage: data.session.last_error_message,
    },
    rounds: data.rounds.map((round: RoundItemApi) => ({
      roundIndex: round.round_index,
      startedAt: round.started_at,
      finishedAt: round.finished_at,
      status: normalizeStatus(round.status) ?? "running",
      userMessage: round.user_message,
      assistantMessage: round.assistant_message,
      debugResult: round.debug_result,
      steps: round.steps,
    })),
  };
}

/**
 * 获取会话列表。
 * - 对应后端 `GET /api/sessions`
 * - 返回规范化后的 SessionListItem[]
 */
export async function getSessionList(): Promise<SessionListItem[]> {
  const data = await requestJson<SessionListResponseApi>("/api/sessions");
  return mapSessionList(data);
}

/**
 * 获取单个会话详情。
 * - 对应后端 `GET /api/sessions/:id`
 * - 返回规范化后的 SessionDetail
 */
export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const encodedSessionId = encodeURIComponent(sessionId);
  const data = await requestJson<SessionDetailResponseApi>(`/api/sessions/${encodedSessionId}`);
  return mapSessionDetail(data);
}
