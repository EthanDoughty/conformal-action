// Types shared across the action, mirroring Interop.fs AnalysisResult

export interface SerializedDiagnostic {
  line: number;
  col: number;
  code: string;
  message: string;
  relatedLine: number | null;
  relatedCol: number | null;
}

export interface FunctionSymbol {
  name: string;
  line: number;
  parms: string[];
  outputs: string[];
}

export interface AnalysisResult {
  diagnostics: SerializedDiagnostic[];
  env: [string, string][];
  symbols: FunctionSymbol[];
  parseError: string | null;
}

export interface ReviewComment {
  path: string;
  line: number;
  code: string;
  body: string;
  severity: 'error' | 'warning' | 'hint';
}

export interface ActionConfig {
  strict: boolean;
  fixpoint: boolean;
  filterToDiff: boolean;
  failOnError: boolean;
  paths: string;
  token: string;
}
