// Entry point for the Conformal GitHub Action.
// Analyzes changed .m files in a PR and posts inline review comments.

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { parseChangedLines } from './diff.js';
import { analyzeFile } from './analyzer.js';
import { postReview } from './review.js';
import type { ActionConfig, ReviewComment } from './types.js';

function readConfig(): ActionConfig {
  return {
    strict: core.getInput('strict') === 'true',
    fixpoint: core.getInput('fixpoint') === 'true',
    filterToDiff: core.getInput('filter_to_diff') !== 'false',
    failOnError: core.getInput('fail_on_error') === 'true',
    paths: core.getInput('paths') || '**/*.m',
    token: core.getInput('token') || process.env.GITHUB_TOKEN || '',
  };
}

/**
 * Read sibling .m files in the same directory (for cross-file analysis).
 * Returns array of [filename, content] pairs, excluding the file being analyzed.
 */
function readSiblings(filePath: string, workspace: string): [string, string][] {
  const fullPath = path.join(workspace, filePath);
  const dir = path.dirname(fullPath);
  const baseName = path.basename(fullPath);
  const siblings: [string, string][] = [];

  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry === baseName) continue;
      if (!entry.endsWith('.m')) continue;
      try {
        const content = fs.readFileSync(path.join(dir, entry), 'utf-8');
        siblings.push([entry.replace(/\.m$/, ''), content]);
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory read failed; no siblings
  }

  return siblings;
}

async function run(): Promise<void> {
  const config = readConfig();
  const ctx = github.context;

  // Guard: only run on pull_request events
  if (!ctx.payload.pull_request) {
    core.info('Not a pull_request event. Skipping.');
    return;
  }

  const pullNumber = ctx.payload.pull_request.number;
  const commitSha = ctx.payload.pull_request.head.sha;
  const owner = ctx.repo.owner;
  const repo = ctx.repo.repo;
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

  const octokit = github.getOctokit(config.token);

  // Fetch changed files (paginated)
  const changedFiles: any[] = [];
  let page = 1;
  while (true) {
    const resp = await (octokit as any).rest.pulls.listFiles({
      owner, repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });
    changedFiles.push(...resp.data);
    if (resp.data.length < 100) break;
    page++;
  }

  // Filter to .m files matching the paths glob
  const mFiles = changedFiles.filter((f: any) => {
    if (f.status === 'removed') return false;
    if (!f.filename.endsWith('.m')) return false;
    return minimatch(f.filename, config.paths);
  });

  if (mFiles.length === 0) {
    core.info('No .m files changed in this PR.');
    core.setOutput('total_warnings', '0');
    core.setOutput('error_count', '0');
    core.setOutput('files_analyzed', '0');
    return;
  }

  // Parse diffs to get changed line numbers
  const changedLines = parseChangedLines(mFiles);

  // Analyze each file
  const allComments: ReviewComment[] = [];
  let filesAnalyzed = 0;

  for (const file of mFiles) {
    const filePath = file.filename;
    const fullPath = path.join(workspace, filePath);

    // Read file content from workspace
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      core.warning(`Could not read ${filePath}, skipping.`);
      continue;
    }

    // Skip binary/non-text files
    if (content.includes('\0')) {
      core.info(`Skipping binary file: ${filePath}`);
      continue;
    }

    // Read sibling .m files for cross-file analysis
    const siblings = readSiblings(filePath, workspace);

    // Run analysis
    const comments = analyzeFile(
      filePath,
      content,
      siblings,
      { strict: config.strict, fixpoint: config.fixpoint },
    );

    allComments.push(...comments);
    filesAnalyzed++;
  }

  // Count severities
  const errorCount = allComments.filter(c => c.severity === 'error').length;
  const totalWarnings = allComments.length;

  core.setOutput('total_warnings', String(totalWarnings));
  core.setOutput('error_count', String(errorCount));
  core.setOutput('files_analyzed', String(filesAnalyzed));

  core.info(`Analyzed ${filesAnalyzed} files: ${totalWarnings} warnings (${errorCount} errors)`);

  // Post review
  if (allComments.length > 0) {
    try {
      await postReview(
        octokit as any,
        owner, repo, pullNumber, commitSha,
        allComments, changedLines, config.filterToDiff,
      );
      core.info('Posted review comments.');
    } catch (err: any) {
      if (err.status === 403) {
        core.error(
          'conformal-action requires pull-requests: write permission. ' +
          'Add "permissions: { pull-requests: write }" to your workflow.'
        );
      } else {
        core.error(`Failed to post review: ${err.message}`);
      }
    }
  } else {
    core.info('No warnings found. Clean!');
  }

  // Fail if configured and errors exist
  if (config.failOnError && errorCount > 0) {
    core.setFailed(`Conformal found ${errorCount} error-severity warnings.`);
  }
}

run().catch((err) => {
  core.setFailed(`Unexpected error: ${err.message}`);
});
