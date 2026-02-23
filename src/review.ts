// Post a PR review with inline comments for Conformal diagnostics.

import type { ReviewComment } from './types.js';

type Octokit = InstanceType<typeof import('@actions/github').GitHub>;

function formatCommentBody(c: ReviewComment): string {
  const icon =
    c.severity === 'error' ? ':x:' :
    c.severity === 'warning' ? ':warning:' :
    ':information_source:';
  return `${icon} **Conformal** \`${c.code}\`\n\n${c.body}`;
}

/**
 * Post a single PR review containing inline comments for all diagnostics.
 * Comments on non-diff lines are collected into a summary in the review body.
 */
export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  comments: ReviewComment[],
  changedLines: Map<string, Set<number>>,
  filterToDiff: boolean,
): Promise<void> {
  // Split comments into inline-eligible (on diff lines) and out-of-diff
  const inline: ReviewComment[] = [];
  const outOfDiff: ReviewComment[] = [];

  for (const c of comments) {
    const fileLines = changedLines.get(c.path);
    if (fileLines && fileLines.has(c.line)) {
      inline.push(c);
    } else {
      outOfDiff.push(c);
    }
  }

  // If filtering to diff, only inline comments are shown.
  // Out-of-diff go into a collapsible summary.
  const inlineToPost = inline.slice(0, 50); // GitHub soft limit
  const overflow = inline.length - inlineToPost.length;

  // Build review body
  const bodyParts: string[] = [];

  if (overflow > 0) {
    bodyParts.push(`... and ${overflow} more warnings not shown inline.`);
  }

  // Out-of-diff warnings: show if not filtering, or show as summary if filtering
  const outOfDiffToShow = filterToDiff ? outOfDiff : [];
  if (outOfDiffToShow.length > 0) {
    bodyParts.push(
      `<details><summary>${outOfDiffToShow.length} warnings on unchanged lines</summary>\n\n` +
      outOfDiffToShow.slice(0, 20).map(c =>
        `- \`${c.path}:${c.line}\`: ${c.body}`
      ).join('\n') +
      (outOfDiffToShow.length > 20 ? `\n- ... and ${outOfDiffToShow.length - 20} more` : '') +
      '\n</details>'
    );
  }

  // If not filtering to diff, also post out-of-diff as inline comments
  const allInline = filterToDiff
    ? inlineToPost
    : [...inlineToPost, ...outOfDiff.filter(c => {
        // For non-filtered mode, we still can only post inline on diff lines
        const fileLines = changedLines.get(c.path);
        return fileLines && fileLines.has(c.line);
      })].slice(0, 50);

  if (allInline.length === 0 && bodyParts.length === 0) {
    // No warnings at all: silent success
    return;
  }

  const body = bodyParts.join('\n\n') || undefined;

  await (octokit as any).rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    commit_id: commitSha,
    event: 'COMMENT',
    body,
    comments: allInline.map(c => ({
      path: c.path,
      line: c.line,
      side: 'RIGHT' as const,
      body: formatCommentBody(c),
    })),
  });
}
