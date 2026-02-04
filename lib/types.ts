export type DebugRequest = {
  input: string;
  sessionId?: string;
};

export type DebugResponse = {
  error_type: string;
  root_cause: string[];
  fix_suggestions: string[];
  prevention: string[];
  raw_model_output?: string;
};
