export type DebugRequest = {
  rawInput?: string;
  input?: string;
  sessionId?: string;
  languageHint?: "ts" | "python" | "unknown" | string;
};

export type DebugSuccessResponse = {
  ok: true;
  sessionId: string;
  requestId: string;
  result: {
    debug_result_json: Record<string, unknown>;
  };
  meta: {
    parse_ms: number;
    debug_ms: number;
    tx_ms: number;
    roundIndex?: number;
  };
};

export type DebugFailureResponse = {
  ok: false;
  sessionId: string;
  requestId: string;
  error: {
    code:
      | "PARSE_FAILED"
      | "DEBUG_FAILED"
      | "JSON_INVALID"
      | "DB_TX_FAILED"
      | "UNKNOWN";
    message: string;
  };
  meta: {
    failed_step: "PARSE" | "DEBUG" | "REPAIR_JSON" | "DB_TX";
    roundIndex?: number;
  };
};

export type DebugResponse = DebugSuccessResponse | DebugFailureResponse;

export type TimelineRoundSource = "authoritative" | "local";

export type TimelineItem = {
  id: string;
  sessionId: string;
  status: "success" | "failed";
  inputPreview: string;
  roundNumber: number;
  roundSource: TimelineRoundSource;
  requestId: string;
  createdAt: string;
  failedStep?: "PARSE" | "DEBUG" | "REPAIR_JSON" | "DB_TX";
  errorCode?: string;
  errorMessage?: string;
  successSummary?: {
    errorType?: string;
    rootCause?: string;
    fixSuggestion?: string;
  };
};
