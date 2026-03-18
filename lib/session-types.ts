/**
 * 这个文件的作用：
 * - 统一定义 Sprint B 会用到的「会话列表」和「会话详情」前端类型。
 * - 这些类型会被 API 请求层、页面、组件共同使用，避免各处重复写 shape。
 */

/**
 * SessionStatus 表示一次调试轮次或会话的状态。
 * - success: 本轮成功完成
 * - failed: 本轮失败，需要展示错误原因
 * - running: 仍在处理中（或尚未得到完整成功/失败信号）
 */
export type SessionStatus = "success" | "failed" | "running";

/**
 * SessionListItemApi 对应 `GET /api/sessions` 的单条原始数据（snake_case）。
 * 这里尽量与后端接口字段保持一致，不在这里做命名改造。
 */
export type SessionListItemApi = {
  /** 会话唯一 ID */
  id: string;
  /** 会话创建时间（ISO 字符串） */
  created_at: string;
  /** 会话最后更新时间（ISO 字符串） */
  updated_at: string;
  /** 用户 ID（当前阶段可能为空） */
  user_id: string | null;
  /** 会话标题（可能为空） */
  title: string | null;
  /** 会话最新状态（可能为空，旧数据兼容） */
  last_status: string | null;
  /** 会话最新轮次索引（用于列表快速展示） */
  last_round_index: number;
  /** 会话最近一次错误信息（失败会话展示） */
  last_error_message: string | null;
};

/**
 * SessionListResponseApi 对应 `GET /api/sessions` 的完整响应。
 */
export type SessionListResponseApi = {
  sessions: SessionListItemApi[];
};

/**
 * SessionListItem 是给页面与组件使用的规范化类型（camelCase）。
 * 页面不需要关心后端是 snake_case 还是 camelCase。
 */
export type SessionListItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  title: string | null;
  lastStatus: SessionStatus | null;
  lastRoundIndex: number;
  lastErrorMessage: string | null;
};

/**
 * SessionDetailMetaApi 对应 `GET /api/sessions/:id` 响应中的 session 元信息。
 */
export type SessionDetailMetaApi = {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  title: string | null;
  last_status: string | null;
  last_round_index: number;
  last_error_message: string | null;
};

/**
 * RoundMessageApi 表示某一轮里的 user_message / assistant_message 结构。
 */
export type RoundMessageApi = {
  /** message 主键 */
  id: string;
  /** 消息文本内容 */
  content: string;
  /** 消息创建时间（ISO 字符串） */
  created_at: string;
  /** 失败时错误码 */
  error_code: string | null;
  /** 失败时错误信息 */
  error_message: string | null;
};

/**
 * DebugResultApi 表示某一轮的调试结果结构。
 */
export type DebugResultApi = {
  /** debug_result 主键（当前实现是 messageId） */
  id: string;
  /** 摘要信息（当前使用 errorType 作为 summary） */
  summary: string | null;
  /** 根因描述 */
  root_cause: string | null;
  /** 修复建议 */
  fix: string | null;
  /** 失败错误码 */
  error_code: string | null;
  /** 失败错误信息 */
  error_message: string | null;
  /** debug_result 的状态 */
  status: string;
};

/**
 * StepItemApi 表示某一轮中的单个步骤（parse/debug/repair/db_tx）。
 */
export type StepItemApi = {
  /** step 主键 */
  id: string;
  /** 步骤类型，例如 PARSE / DEBUG / REPAIR_JSON / DB_TX */
  step_type: string;
  /** 同一步骤的尝试次数索引 */
  attempt_index: number;
  /** 当前步骤状态 */
  status: string;
  /** 推导出的开始时间（ISO 字符串） */
  started_at: string;
  /** 推导出的结束时间（ISO 字符串，可空） */
  finished_at: string | null;
  /** 步骤耗时（毫秒，可空） */
  latency_ms: number | null;
  /** 失败错误码 */
  error_code: string | null;
  /** 失败错误信息 */
  error_message: string | null;
  /** 输入预览（长内容已截断） */
  input_preview: string | null;
  /** 输出预览（长内容已截断） */
  output_preview: string | null;
};

/**
 * RoundItemApi 表示详情页中的一个轮次对象。
 */
export type RoundItemApi = {
  round_index: number;
  started_at: string | null;
  finished_at: string | null;
  status: SessionStatus;
  user_message: RoundMessageApi | null;
  assistant_message: RoundMessageApi | null;
  debug_result: DebugResultApi | null;
  steps: StepItemApi[];
};

/**
 * SessionDetailResponseApi 对应 `GET /api/sessions/:id` 的完整响应。
 */
export type SessionDetailResponseApi = {
  session: SessionDetailMetaApi;
  rounds: RoundItemApi[];
};

/**
 * SessionDetail 是前端规范化后的详情类型（camelCase）。
 */
export type SessionDetail = {
  session: {
    id: string;
    createdAt: string;
    updatedAt: string;
    userId: string | null;
    title: string | null;
    lastStatus: SessionStatus | null;
    lastRoundIndex: number;
    lastErrorMessage: string | null;
  };
  rounds: Array<{
    roundIndex: number;
    startedAt: string | null;
    finishedAt: string | null;
    status: SessionStatus;
    userMessage: RoundMessageApi | null;
    assistantMessage: RoundMessageApi | null;
    debugResult: DebugResultApi | null;
    steps: StepItemApi[];
  }>;
};
