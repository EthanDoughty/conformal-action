// Parse unified diff patches from GitHub's pull files API to extract changed line numbers.

interface PullFile {
  filename: string;
  status: string;
  patch?: string;
  previous_filename?: string;
}

/**
 * Parse the @@ hunk headers and + lines from a unified diff patch.
 * Returns the set of line numbers (1-based) on the new-file side that were added or modified.
 */
function parsePatchLines(patch: string): Set<number> {
  const lines = new Set<number>();
  const patchLines = patch.split('\n');
  let currentLine = 0;

  for (const raw of patchLines) {
    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (raw.startsWith('+')) {
      // Added line on the new side
      lines.add(currentLine);
      currentLine++;
    } else if (raw.startsWith('-')) {
      // Removed line: don't increment new-side counter
    } else {
      // Context line (or empty): increment new-side counter
      currentLine++;
    }
  }

  return lines;
}

/**
 * Build a map of filename -> changed line numbers from the PR's file list.
 * Only includes added or modified files that have a patch.
 */
export function parseChangedLines(files: PullFile[]): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();

  for (const file of files) {
    if (file.status === 'removed') continue;
    if (!file.patch) continue;

    const lines = parsePatchLines(file.patch);
    result.set(file.filename, lines);
  }

  return result;
}
