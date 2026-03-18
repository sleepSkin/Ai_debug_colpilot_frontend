import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DebugRequestBody = {
  rawInput?: unknown;
  input?: unknown;
  sessionId?: unknown;
  languageHint?: unknown;
};

type JsonObject = Record<string, unknown>;

type StepType = "PARSE" | "DEBUG" | "REPAIR_JSON" | "DB_TX";
type StepStatus = "success" | "failed";
type ErrorCode =
  | "PARSE_FAILED"
  | "DEBUG_FAILED"
  | "JSON_INVALID"
  | "DB_TX_FAILED"
  | "UNKNOWN";

type FailedStep = "PARSE" | "DEBUG" | "REPAIR_JSON" | "DB_TX";

type StepDraft = {
  stepType: StepType;
  attempt: number;
  status: StepStatus;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  payloadIn?: unknown;
  payloadOut?: unknown;
};

type DebugApiSuccessBody = {
  ok: true;
  sessionId: string;
  requestId: string;
  result: {
    debug_result_json: JsonObject;
  };
  meta: {
    parse_ms: number;
    debug_ms: number;
    tx_ms: number;
    roundIndex: number;
  };
};

type DebugApiFailureBody = {
  ok: false;
  sessionId: string;
  requestId: string;
  error: {
    code: ErrorCode;
    message: string;
  };
  meta: {
    failed_step: FailedStep;
    roundIndex?: number;
  };
};

/**
 * 作用/业务含义：
 * 将未知输入安全转换为去首尾空白的字符串，用于统一处理请求体字段。
 *
 * 入参说明：
 * - value: unknown，任意类型输入。
 *
 * 返回值结构：
 * - 成功：返回字符串；当输入非字符串时返回空字符串。
 *
 * 安全与权限：
 * - 不涉及权限控制。
 * - 仅做类型收敛与最小清洗，不做业务过滤。
 *
 * 关键边界条件：
 * - null/undefined/对象/数组等非字符串输入，统一返回空字符串。
 */
function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 作用/业务含义：
 * 将未知值转换为字符串数组，确保下游结构化输出字段稳定。
 *
 * 入参说明：
 * - value: unknown，通常是 LLM 输出的数组字段。
 *
 * 返回值结构：
 * - 成功：字符串数组。
 * - 非数组输入：空数组。
 *
 * 安全与权限：
 * - 不涉及权限控制。
 * - 不做敏感信息识别，仅进行类型规整。
 *
 * 关键边界条件：
 * - 数组项为对象/数字/布尔时，统一使用 String(item) 转换。
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

/**
 * 作用/业务含义：
 * 从对象中按候选键顺序提取首个非空字符串，兼容多版本字段命名。
 *
 * 入参说明：
 * - value: Record<string, unknown>，待读取对象。
 * - keys: string[]，候选字段名列表。
 *
 * 返回值结构：
 * - 命中时返回去空白字符串；未命中返回空字符串。
 *
 * 安全与权限：
 * - 不涉及权限控制。
 * - 仅做读取，不修改原对象。
 *
 * 关键边界条件：
 * - 字段存在但为空白字符串时视为无效，继续尝试下一个键。
 */
function pickFirstString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

/**
 * 作用/业务含义：
 * 安全序列化任意值，用于写入 StepAttempt 的 payload_out，避免 BigInt 导致 JSON.stringify 报错。
 *
 * 入参说明：
 * - value: unknown，待序列化对象。
 *
 * 返回值结构：
 * - 可 JSON 化对象；失败时返回字符串兜底。
 *
 * 安全与权限：
 * - 不涉及权限控制。
 * - 仅做最小可序列化处理，不做深度脱敏。
 *
 * 关键边界条件：
 * - 遇到 BigInt 会转为字符串。
 * - 若序列化仍失败，返回统一错误文本，避免 API 二次崩溃。
 */
function toJsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(value, (_, current) => {
        if (typeof current === "bigint") return current.toString();
        return current;
      })
    );
  } catch {
    return "[unserializable_payload]";
  }
}

/**
 * 作用/业务含义：
 * 从可能包含 Markdown code fence、前后说明文字的文本中提取候选 JSON 片段。
 *
 * 入参说明：
 * - rawText: string，原始模型输出文本。
 *
 * 返回值结构：
 * - 返回清洗后的候选 JSON 文本，可能仍需后续修复。
 *
 * 安全与权限：
 * - 不涉及权限控制。
 * - 仅做文本清洗，不执行任何代码。
 *
 * 关键边界条件：
 * - 存在 ```json ... ``` 包裹时会剥离。
 * - 文本中包含多段内容时优先提取最外层 {...} 或 [...]
 */
function extractCandidateJson(rawText: string): string {
  let text = rawText.trim();

  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");

  const hasObject = objectStart >= 0 && objectEnd > objectStart;
  const hasArray = arrayStart >= 0 && arrayEnd > arrayStart;

  if (hasObject && hasArray) {
    if (objectStart < arrayStart) {
      return text.slice(objectStart, objectEnd + 1);
    }
    return text.slice(arrayStart, arrayEnd + 1);
  }

  if (hasObject) {
    return text.slice(objectStart, objectEnd + 1);
  }

  if (hasArray) {
    return text.slice(arrayStart, arrayEnd + 1);
  }

  return text;
}

/**
 * 作用/业务含义：
 * 执行本地 JSON 修复策略（低成本）：清理非法控制字符与尾随逗号后再解析。
 *
 * 入参说明：
 * - rawText: string，原始模型输出文本。
 *
 * 返回值结构：
 * - 成功：{ ok: true, json: JsonObject }
 * - 失败：{ ok: false, message: string }
 *
 * 安全与权限：
 * - 不涉及权限控制。
 * - 不执行任意脚本，仅做字符串替换与 JSON.parse。
 *
 * 关键边界条件：
 * - 若解析结果是数组或非对象结构，视为不满足 debug 结果契约并返回失败。
 */
function tryLocalRepairJson(rawText: string):
  | { ok: true; json: JsonObject }
  | { ok: false; message: string } {
  const candidate = extractCandidateJson(rawText)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/,\s*([}\]])/g, "$1");

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false, message: "Local repair parsed non-object JSON." };
    }
    return { ok: true, json: parsed as JsonObject };
  } catch (error: unknown) {
    return { ok: false, message: String((error as Error)?.message ?? error) };
  }
}

/**
 * 作用/业务含义：
 * 调用 FastAPI `/repair_json` 做二次修复兜底，确保 JSON 非法时仍有恢复机会。
 *
 * 入参说明：
 * - baseUrl: string，FastAPI 基础地址（已去掉末尾斜杠）。
 * - rawText: string，待修复原始文本。
 *
 * 返回值结构：
 * - 成功：{ ok: true, json: JsonObject }
 * - 失败：{ ok: false, message: string }
 *
 * 安全与权限：
 * - 当前接口无鉴权，默认信任内部服务网络。
 * - 仅发送原始文本，不携带额外敏感上下文。
 *
 * 关键边界条件：
 * - /repair_json 非 2xx、响应非 JSON、或 repaired_json 非对象时均返回失败。
 */
async function tryRemoteRepairJson(
  baseUrl: string,
  rawText: string
): Promise<{ ok: true; json: JsonObject } | { ok: false; message: string }> {
  try {
    const resp = await fetch(`${baseUrl}/repair_json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: rawText }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return {
        ok: false,
        message: `repair_json http ${resp.status}: ${text}`,
      };
    }

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const repaired = parsed.repaired_json;

    if (!repaired || Array.isArray(repaired) || typeof repaired !== "object") {
      return { ok: false, message: "repair_json returned non-object repaired_json." };
    }

    return { ok: true, json: repaired as JsonObject };
  } catch (error: unknown) {
    return { ok: false, message: String((error as Error)?.message ?? error) };
  }
}

/**
 * 作用/业务含义：
 * 统一构建 API 响应，并确保 `X-Session-Id`/`X-Request-Id` 在成功与失败路径都返回。
 *
 * 入参说明：
 * - payload: DebugApiSuccessBody | DebugApiFailureBody，响应体。
 * - status: number，HTTP 状态码。
 *
 * 返回值结构：
 * - NextResponse JSON，带固定链路头。
 *
 * 安全与权限：
 * - 不涉及权限控制。
 * - requestId/sessionId 仅用于可观测与回放，不承载鉴权含义。
 *
 * 关键边界条件：
 * - 即使出现失败，也不会遗漏响应头。
 */
function buildDebugResponse(
  payload: DebugApiSuccessBody | DebugApiFailureBody,
  status: number
): NextResponse {
  const roundIndex = payload.meta.roundIndex;
  const headers: Record<string, string> = {
    "X-Session-Id": payload.sessionId,
    "X-Request-Id": payload.requestId,
  };
  if (typeof roundIndex === "number" && Number.isFinite(roundIndex)) {
    headers["X-Round-Index"] = String(roundIndex);
  }

  return NextResponse.json(payload, {
    status,
    headers,
  });
}

/**
 * 作用/业务含义：
 * 创建或复用 Session，并返回当前轮次 roundIndex。
 *
 * 入参说明：
 * - tx: Prisma 事务客户端。
 * - sessionId: string，会话 ID（可能来自前端复用）。
 *
 * 返回值结构：
 * - { sessionId, roundIndex }
 *
 * 安全与权限：
 * - 当前 SprintA 不做用户鉴权，后续应补充 userId 校验防止跨用户会话访问。
 *
 * 关键边界条件：
 * - 会话不存在时自动创建。
 * - roundIndex 基于已有 user message 数量 + 1，不覆盖历史。
 */
async function ensureSessionAndRound(
  tx: Prisma.TransactionClient,
  sessionId: string
): Promise<{ sessionId: string; roundIndex: number }> {
  await tx.session.upsert({
    where: { id: sessionId },
    create: { id: sessionId, lastRoundIndex: 0 },
    update: {},
  });

  const updatedSession = await tx.session.update({
    where: { id: sessionId },
    data: {
      lastRoundIndex: { increment: 1 },
      updatedAt: new Date(),
    },
    select: { lastRoundIndex: true },
  });

  return {
    sessionId,
    roundIndex: updatedSession.lastRoundIndex,
  };
}

/**
 * 作用/业务含义：
 * 写入一次调试轮次的持久化数据（Session、Message、DebugResult、StepAttempt）。
 *
 * 入参说明：
 * - sessionId: string，会话 ID。
 * - requestId: string，请求链路 ID。
 * - rawInput: string，用户原始输入。
 * - parsed: JsonObject | null，/parse 输出。
 * - debugResultJson: JsonObject | null，最终合法的 debug JSON。
 * - debugRawText: string，debug 原始文本（用于回放）。
 * - isSuccess: boolean，本轮是否成功。
 * - errorCode/errorMessage: 失败编码与描述。
 * - steps: StepDraft[]，流程步骤草稿。
 *
 * 返回值结构：
 * - Promise<void>
 *
 * 安全与权限：
 * - 当前无鉴权，后续需引入 userId 绑定。
 * - Step payload 仅保存必要上下文，避免写入超大敏感原文。
 *
 * 关键边界条件：
 * - 失败路径也必须写入 user message。
 * - 成功路径写 assistant + debug_result；失败路径写 assistant failed，保留错误证据。
 */
async function persistRoundData(params: {
  sessionId: string;
  requestId: string;
  rawInput: string;
  parsed: JsonObject | null;
  debugResultJson: JsonObject | null;
  debugRawText: string;
  isSuccess: boolean;
  errorCode?: ErrorCode;
  errorMessage?: string;
  steps: StepDraft[];
}): Promise<{ roundIndex: number }> {
  const {
    sessionId,
    requestId,
    rawInput,
    parsed,
    debugResultJson,
    debugRawText,
    isSuccess,
    errorCode,
    errorMessage,
    steps,
  } = params;

  const txStartedAt = Date.now();

  let persistedRoundIndex = 0;

  await prisma.$transaction(async (tx) => {
    const { roundIndex } = await ensureSessionAndRound(tx, sessionId);
    persistedRoundIndex = roundIndex;

    const language = pickFirstString(parsed ?? {}, ["language", "lang"]) || "unknown";
    const codeSnippet =
      pickFirstString(parsed ?? {}, ["code_snippet", "code", "snippet", "related_code"]) || "";

    await tx.message.create({
      data: {
        sessionId,
        role: "user",
        roundIndex,
        language,
        errorText: rawInput,
        codeSnippet,
        status: isSuccess ? "success" : "failed",
        errorCode: isSuccess ? null : errorCode ?? "UNKNOWN",
        errorMessage: isSuccess ? null : errorMessage ?? "Unhandled failure",
        schemaVersion: "message@v2.0",
        metadata: {
          requestId,
          parsed,
          roundIndex,
        },
      },
    });

    const assistantMessage = await tx.message.create({
      data: {
        sessionId,
        role: "assistant",
        roundIndex,
        language,
        errorText: rawInput,
        codeSnippet,
        assistantJson: debugResultJson,
        rawModelOutput: debugRawText || null,
        status: isSuccess ? "success" : "failed",
        errorCode: isSuccess ? null : errorCode ?? "UNKNOWN",
        errorMessage: isSuccess ? null : errorMessage ?? "Unhandled failure",
        schemaVersion: "message@v2.0",
        metadata: {
          requestId,
          roundIndex,
        },
      },
    });

    if (debugResultJson) {
      await tx.debugResult.create({
        data: {
          messageId: assistantMessage.id,
          sessionId,
          roundIndex,
          errorType: String(debugResultJson.error_type ?? "unknown"),
          rootCause: toStringArray(debugResultJson.root_cause),
          fixSuggestions: toStringArray(debugResultJson.fix_suggestions),
          prevention: toStringArray(debugResultJson.prevention),
          rawModelOutput: debugRawText || null,
          modelName:
            typeof debugResultJson.model_name === "string" ? debugResultJson.model_name : null,
          promptVersion:
            typeof debugResultJson.prompt_version === "string"
              ? debugResultJson.prompt_version
              : null,
          status: isSuccess ? "success" : "failed",
          errorCode: isSuccess ? null : errorCode ?? "UNKNOWN",
          errorMessage: isSuccess ? null : errorMessage ?? "Unhandled failure",
          schemaVersion: "debug@v2.0",
          metadata: {
            requestId,
            roundIndex,
          },
        },
      });
    }

    const dbTxStep: StepDraft = {
      stepType: "DB_TX",
      attempt: 1,
      status: "success",
      durationMs: Date.now() - txStartedAt,
      payloadIn: {
        hasParsed: Boolean(parsed),
        hasDebugResult: Boolean(debugResultJson),
      },
      payloadOut: {
        persisted: true,
      },
    };

    const stepsToPersist = [...steps, dbTxStep];

    await tx.stepAttempt.createMany({
      data: stepsToPersist.map((step) => ({
        sessionId,
        roundIndex,
        stepType: step.stepType,
        attempt: step.attempt,
        status: step.status,
        errorCode: step.errorCode ?? null,
        errorMessage: step.errorMessage ?? null,
        requestId,
        durationMs: step.durationMs ?? null,
        payloadIn: toJsonSafe(step.payloadIn),
        payloadOut: toJsonSafe(step.payloadOut),
      })),
    });

    await tx.session.update({
      where: { id: sessionId },
      data: {
        updatedAt: new Date(),
        lastStatus: isSuccess ? "success" : "failed",
        lastErrorMessage: isSuccess ? null : errorMessage ?? "Unhandled failure",
      },
    });
  });

  return { roundIndex: persistedRoundIndex };
}

/**
 * 作用/业务含义：
 * Sprint A 主入口：串行执行 parse -> debug -> repair(JSON) -> transaction write，保证失败可追溯。
 *
 * 入参说明：
 * - req: Request，请求体支持 rawInput（新）与 input（兼容）。
 *
 * 返回值结构：
 * - 成功：{ ok, sessionId, requestId, result, meta }
 * - 失败：{ ok:false, sessionId, requestId, error, meta }
 *
 * 安全与权限：
 * - 当前接口未接入鉴权，需在后续 Sprint 增加 userId 绑定与权限校验。
 * - 已做基础输入校验，拒绝空输入。
 *
 * 关键边界条件：
 * - FASTAPI_BASE_URL 缺失时直接失败并返回结构化错误。
 * - 任意步骤失败都尝试落库；响应头始终携带 X-Session-Id/X-Request-Id。
 * - JSON 非法时先本地修复，再调用 /repair_json；两者都失败则返回 JSON_INVALID。
 */
export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let sessionId = crypto.randomUUID();
  const steps: StepDraft[] = [];
  let rawInput = "";
  let languageHint = "";

  let parsed: JsonObject | null = null;
  let debugResultJson: JsonObject | null = null;
  let debugRawText = "";

  let parseMs = 0;
  let debugMs = 0;
  let txMs = 0;
  let roundIndex: number | undefined;

  let failedStep: FailedStep | null = null;
  let errorCode: ErrorCode | null = null;
  let errorMessage = "";
  let fastapiBaseUrl = "";

  try {
  try {
    const body = (await req.json()) as DebugRequestBody;
    rawInput = toTrimmedString(body.rawInput) || toTrimmedString(body.input);
    const sessionIdInput = toTrimmedString(body.sessionId);
    languageHint = toTrimmedString(body.languageHint);

    if (sessionIdInput) {
      sessionId = sessionIdInput;
    }
  } catch (error: unknown) {
    failedStep = "PARSE";
    errorCode = "PARSE_FAILED";
    errorMessage = `Invalid request JSON: ${String((error as Error)?.message ?? error)}`;
    steps.push({
      stepType: "PARSE",
      attempt: 1,
      status: "failed",
      errorCode,
      errorMessage,
      payloadIn: null,
      payloadOut: null,
    });
  }

  if (!failedStep && !rawInput) {
    failedStep = "PARSE";
    errorCode = "PARSE_FAILED";
    errorMessage = "rawInput/input is required";
    steps.push({
      stepType: "PARSE",
      attempt: 1,
      status: "failed",
      errorCode,
      errorMessage,
      payloadIn: { rawInput, languageHint },
      payloadOut: null,
    });
  }

  fastapiBaseUrl = (process.env.FASTAPI_BASE_URL ?? "").trim();
  if (!failedStep && !fastapiBaseUrl) {
    failedStep = "PARSE";
    errorCode = "PARSE_FAILED";
    errorMessage = "Missing FASTAPI_BASE_URL";
    steps.push({
      stepType: "PARSE",
      attempt: 1,
      status: "failed",
      errorCode,
      errorMessage,
      payloadIn: { rawInput, languageHint },
      payloadOut: null,
    });
  }

  const baseUrl = fastapiBaseUrl.replace(/\/$/, "");

  if (!failedStep) {
    let parseText = "";
    const parseStartedAt = Date.now();
    try {
      const parseResp = await fetch(`${baseUrl}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_input: rawInput,
          language_hint: languageHint || undefined,
        }),
      });
      parseText = await parseResp.text();
      parseMs = Date.now() - parseStartedAt;

      if (!parseResp.ok) {
        failedStep = "PARSE";
        errorCode = "PARSE_FAILED";
        errorMessage = `FastAPI /parse failed: ${parseText}`;
        steps.push({
          stepType: "PARSE",
          attempt: 1,
          status: "failed",
          errorCode,
          errorMessage,
          durationMs: parseMs,
          payloadIn: { rawInput, languageHint },
          payloadOut: { httpStatus: parseResp.status, body: parseText },
        });
      } else {
        try {
          parsed = JSON.parse(parseText) as JsonObject;
          steps.push({
            stepType: "PARSE",
            attempt: 1,
            status: "success",
            durationMs: parseMs,
            payloadIn: { rawInput, languageHint },
            payloadOut: parsed,
          });
        } catch (error: unknown) {
          failedStep = "PARSE";
          errorCode = "PARSE_FAILED";
          errorMessage = `Parse response is not valid JSON: ${String((error as Error)?.message ?? error)}`;
          steps.push({
            stepType: "PARSE",
            attempt: 1,
            status: "failed",
            errorCode,
            errorMessage,
            durationMs: parseMs,
            payloadIn: { rawInput, languageHint },
            payloadOut: parseText,
          });
        }
      }
    } catch (error: unknown) {
      parseMs = Date.now() - parseStartedAt;
      failedStep = "PARSE";
      errorCode = "PARSE_FAILED";
      errorMessage = `FastAPI /parse request failed: ${String((error as Error)?.message ?? error)}`;
      steps.push({
        stepType: "PARSE",
        attempt: 1,
        status: "failed",
        errorCode,
        errorMessage,
        durationMs: parseMs,
        payloadIn: { rawInput, languageHint },
        payloadOut: null,
      });
    }
  }

  if (!failedStep && parsed) {
    let debugRespText = "";
    const debugStartedAt = Date.now();
    try {
      const debugResp = await fetch(`${baseUrl}/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version: "debug@v2.0",
          parsed,
          similar_bugs: [],
          constraints: {
            strict_json: true,
          },
        }),
      });
      debugRespText = await debugResp.text();
      debugRawText = debugRespText;
      debugMs = Date.now() - debugStartedAt;

      if (!debugResp.ok) {
        failedStep = "DEBUG";
        errorCode = "DEBUG_FAILED";
        errorMessage = `FastAPI /debug failed: ${debugRespText}`;
        steps.push({
          stepType: "DEBUG",
          attempt: 1,
          status: "failed",
          errorCode,
          errorMessage,
          durationMs: debugMs,
          payloadIn: { parsed },
          payloadOut: { httpStatus: debugResp.status, body: debugRespText },
        });
      } else {
        try {
          debugResultJson = JSON.parse(debugRespText) as JsonObject;
          steps.push({
            stepType: "DEBUG",
            attempt: 1,
            status: "success",
            durationMs: debugMs,
            payloadIn: { parsed },
            payloadOut: debugResultJson,
          });
        } catch (error: unknown) {
          steps.push({
            stepType: "DEBUG",
            attempt: 1,
            status: "failed",
            errorCode: "JSON_INVALID",
            errorMessage: `Debug JSON parse failed: ${String((error as Error)?.message ?? error)}`,
            durationMs: debugMs,
            payloadIn: { parsed },
            payloadOut: debugRespText,
          });

          const localRepair = tryLocalRepairJson(debugRespText);
          if (localRepair.ok) {
            debugResultJson = localRepair.json;
            steps.push({
              stepType: "REPAIR_JSON",
              attempt: 1,
              status: "success",
              payloadIn: { rawText: debugRespText },
              payloadOut: debugResultJson,
            });
          } else {
            steps.push({
              stepType: "REPAIR_JSON",
              attempt: 1,
              status: "failed",
              errorCode: "JSON_INVALID",
              errorMessage: localRepair.message,
              payloadIn: { rawText: debugRespText },
              payloadOut: null,
            });

            const remoteRepair = await tryRemoteRepairJson(baseUrl, debugRespText);
            if (remoteRepair.ok) {
              debugResultJson = remoteRepair.json;
              steps.push({
                stepType: "REPAIR_JSON",
                attempt: 2,
                status: "success",
                payloadIn: { rawText: debugRespText },
                payloadOut: debugResultJson,
              });
            } else {
              failedStep = "REPAIR_JSON";
              errorCode = "JSON_INVALID";
              errorMessage = `JSON repair failed: ${remoteRepair.message}`;
              steps.push({
                stepType: "REPAIR_JSON",
                attempt: 2,
                status: "failed",
                errorCode,
                errorMessage,
                payloadIn: { rawText: debugRespText },
                payloadOut: null,
              });
            }
          }
        }
      }
    } catch (error: unknown) {
      debugMs = Date.now() - debugStartedAt;
      failedStep = "DEBUG";
      errorCode = "DEBUG_FAILED";
      errorMessage = `FastAPI /debug request failed: ${String((error as Error)?.message ?? error)}`;
      steps.push({
        stepType: "DEBUG",
        attempt: 1,
        status: "failed",
        errorCode,
        errorMessage,
        durationMs: debugMs,
        payloadIn: { parsed },
        payloadOut: null,
      });
    }
  }

  if (failedStep === "PARSE" && !steps.some((step) => step.stepType === "DEBUG")) {
    steps.push({
      stepType: "DEBUG",
      attempt: 1,
      status: "failed",
      errorCode: "PARSE_FAILED",
      errorMessage: "Skipped /debug because /parse failed.",
      payloadIn: { parsed: null },
      payloadOut: null,
    });
  }

  const txStartedAt = Date.now();
  try {
    const persisted = await persistRoundData({
      sessionId,
      requestId,
      rawInput,
      parsed,
      debugResultJson,
      debugRawText,
      isSuccess: !failedStep && Boolean(debugResultJson),
      errorCode: errorCode ?? undefined,
      errorMessage: errorMessage || undefined,
      steps,
    });
    txMs = Date.now() - txStartedAt;
    roundIndex = persisted.roundIndex;
  } catch (error: unknown) {
    txMs = Date.now() - txStartedAt;
    const dbFailureBody: DebugApiFailureBody = {
      ok: false,
      sessionId,
      requestId,
      error: {
        code: "DB_TX_FAILED",
        message: String((error as Error)?.message ?? error),
      },
      meta: {
        failed_step: "DB_TX",
      },
    };
    return buildDebugResponse(dbFailureBody, 500);
  }

  if (failedStep || !debugResultJson) {
    const failureBody: DebugApiFailureBody = {
      ok: false,
      sessionId,
      requestId,
      error: {
        code: errorCode ?? "UNKNOWN",
        message: errorMessage || "Unknown failure",
      },
      meta: {
        failed_step: failedStep ?? "DEBUG",
        roundIndex,
      },
    };

    const failedStatus = errorCode === "PARSE_FAILED" ? 400 : 502;
    return buildDebugResponse(failureBody, failedStatus);
  }

  const successBody: DebugApiSuccessBody = {
    ok: true,
    sessionId,
    requestId,
    result: {
      debug_result_json: debugResultJson,
    },
    meta: {
      parse_ms: parseMs,
      debug_ms: debugMs,
      tx_ms: txMs,
      roundIndex: roundIndex ?? 1,
    },
  };

  return buildDebugResponse(successBody, 200);
  } catch (error: unknown) {
    const normalizedFailedStep: FailedStep = failedStep ?? "PARSE";
    const normalizedErrorCode: ErrorCode = errorCode ?? "UNKNOWN";
    const normalizedErrorMessage = String((error as Error)?.message ?? error);

    try {
      const persisted = await persistRoundData({
        sessionId,
        requestId,
        rawInput,
        parsed,
        debugResultJson,
        debugRawText,
        isSuccess: false,
        errorCode: normalizedErrorCode,
        errorMessage: normalizedErrorMessage,
        steps:
          steps.length > 0
            ? steps
            : [
                {
                  stepType: normalizedFailedStep,
                  attempt: 1,
                  status: "failed",
                  errorCode: normalizedErrorCode,
                  errorMessage: normalizedErrorMessage,
                  payloadIn: null,
                  payloadOut: null,
                },
              ],
      });
      roundIndex = persisted.roundIndex;
    } catch {
      // 忽略兜底落库失败，最终返回结构化 UNKNOWN。
    }

    const fallbackBody: DebugApiFailureBody = {
      ok: false,
      sessionId,
      requestId,
      error: {
        code: normalizedErrorCode,
        message: normalizedErrorMessage,
      },
      meta: {
        failed_step: normalizedFailedStep,
        roundIndex,
      },
    };

    return buildDebugResponse(fallbackBody, 502);
  }
}
