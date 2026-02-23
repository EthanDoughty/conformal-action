// Wrapper around the Fable-compiled analyzeSource entry point.

import type { AnalysisResult, ReviewComment } from './types.js';

// The Fable output uses ES module syntax; esbuild bundles it into CJS for us.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const interop = require('./fable-out/Interop.js');

// Error-severity codes (same set as server.ts in the VS Code extension)
const ERROR_CODES = new Set([
  'W_INNER_DIM_MISMATCH',
  'W_ELEMENTWISE_MISMATCH',
  'W_CONSTRAINT_CONFLICT',
  'W_HORZCAT_ROW_MISMATCH',
  'W_VERTCAT_COL_MISMATCH',
  'W_RESHAPE_MISMATCH',
  'W_INDEX_OUT_OF_BOUNDS',
  'W_DIVISION_BY_ZERO',
  'W_ARITHMETIC_TYPE_MISMATCH',
  'W_TRANSPOSE_TYPE_MISMATCH',
  'W_NEGATE_TYPE_MISMATCH',
  'W_CONCAT_TYPE_MISMATCH',
  'W_INDEX_ASSIGN_TYPE_MISMATCH',
  'W_POSSIBLY_NEGATIVE_DIM',
  'W_FUNCTION_ARG_COUNT_MISMATCH',
  'W_LAMBDA_ARG_COUNT_MISMATCH',
  'W_MULTI_ASSIGN_COUNT_MISMATCH',
  'W_MULTI_ASSIGN_NON_CALL',
  'W_MULTI_ASSIGN_BUILTIN',
  'W_PROCEDURE_IN_EXPR',
  'W_BREAK_OUTSIDE_LOOP',
  'W_CONTINUE_OUTSIDE_LOOP',
  'W_STRICT_MODE',
  'W_MLDIVIDE_DIM_MISMATCH',
  'W_MATRIX_POWER_NON_SQUARE',
]);

// Strict-only codes: suppressed in default mode
const STRICT_ONLY_CODES = new Set([
  'W_UNKNOWN_FUNCTION',
  'W_RECURSIVE_FUNCTION',
  'W_RECURSIVE_LAMBDA',
  'W_UNSUPPORTED_BUILTIN',
  'W_UNSUPPORTED_SYNTAX',
  'W_UNSUPPORTED_INDEX_TYPE',
  'W_UNSUPPORTED_FIELD_BASE',
  'W_UNSUPPORTED_HANDLE_TARGET',
  'W_UNSUPPORTED_SWITCH_EXPR',
  'W_END_OUTSIDE_INDEXING',
  'W_EXTERNAL_PARSE_ERROR',
  'W_STRUCT_FIELD_NOT_FOUND',
  'W_CELL_TYPE_MISMATCH',
  'W_INDEX_INTO_NON_MATRIX',
  'W_NON_MATRIX_MULTIPLICATION',
  'W_SUBSCRIPT_ON_NON_INDEXABLE',
  'W_FIELD_ACCESS_ON_NON_STRUCT',
  'W_UNKNOWN_SIZE_FUNCTION',
  'W_GLOBAL_NOT_SUPPORTED',
]);

function classifySeverity(code: string): 'error' | 'warning' | 'hint' {
  if (ERROR_CODES.has(code)) return 'error';
  if (code.startsWith('W_UNSUPPORTED_')) return 'hint';
  return 'warning';
}

/**
 * Analyze a single MATLAB file and return structured diagnostics.
 */
export function analyzeFile(
  filePath: string,
  content: string,
  siblings: [string, string][],
  options: { strict: boolean; fixpoint: boolean },
): ReviewComment[] {
  let result: AnalysisResult;
  try {
    result = interop.analyzeSource(content, options.fixpoint, options.strict, siblings);
  } catch {
    // If analysis crashes, report a single diagnostic
    return [{
      path: filePath,
      line: 1,
      code: 'W_INTERNAL_ERROR',
      body: 'Conformal: internal analysis error on this file.',
      severity: 'warning',
    }];
  }

  // Handle parse errors
  if (result.parseError) {
    return [{
      path: filePath,
      line: 1,
      code: 'W_PARSE_ERROR',
      body: `Conformal: syntax error: ${result.parseError}`,
      severity: 'error',
    }];
  }

  const comments: ReviewComment[] = [];
  for (const d of result.diagnostics) {
    // Filter strict-only codes in default mode
    if (!options.strict && STRICT_ONLY_CODES.has(d.code)) continue;

    comments.push({
      path: filePath,
      line: d.line,
      code: d.code,
      body: d.message,
      severity: classifySeverity(d.code),
    });
  }

  return comments;
}
