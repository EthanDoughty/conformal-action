# Conformal: MATLAB Shape Analysis for Pull Requests

Static shape and dimension analysis for MATLAB. Conformal catches matrix dimension errors in PRs before they reach runtime. No MATLAB license is required.

## Quick Start

```yaml
name: MATLAB Shape Check
on:
  pull_request:
    paths: ['**/*.m']

permissions:
  pull-requests: write
  contents: read

jobs:
  conformal:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: EthanDoughty/conformal-action@v1
```

## What It Does

When a PR changes `.m` files, this action analyzes each changed file for shape and dimension errors. First, it reads sibling `.m` files in the same directory for cross-file context, including function signatures and return shapes. Second, it runs the shape analysis on each changed file. Finally, it posts inline review comments on the PR diff at the exact lines where issues are found.

Warnings are informational by default. They appear as review comments, not blocking checks.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `strict` | `false` | Show all warnings including low-confidence diagnostics |
| `fixpoint` | `false` | Enable iterative loop analysis for better precision |
| `filter_to_diff` | `true` | Only comment on lines changed in this PR |
| `fail_on_error` | `false` | Fail the action if error-severity warnings are found |
| `paths` | `**/*.m` | Glob pattern to filter which `.m` files are analyzed |
| `token` | `github.token` | GitHub token for posting review comments |

## Outputs

| Output | Description |
|--------|-------------|
| `total_warnings` | Total number of warnings found |
| `error_count` | Number of error-severity warnings |
| `files_analyzed` | Number of `.m` files analyzed |

## Examples

### Block PRs with dimension errors

```yaml
- uses: EthanDoughty/conformal-action@v1
  with:
    fail_on_error: true
```

### Analyze all warnings in strict mode

```yaml
- uses: EthanDoughty/conformal-action@v1
  with:
    strict: true
    filter_to_diff: false
```

### Only check files in a specific directory

```yaml
- uses: EthanDoughty/conformal-action@v1
  with:
    paths: 'src/**/*.m'
```

## Detected Issues

Conformal catches inner dimension mismatches in matrix multiplication (like `A * B` where the dims don't align), element-wise operation mismatches (`A .* B` with incompatible shapes), and horizontal or vertical concatenation row and column mismatches. It can also detect index out of bounds when the bounds can be statically determined, division by zero when the divisor is provably zero, function argument count mismatches, and reshape dimension mismatches.

## License

BSL 1.1. See [LICENSE](LICENSE) for details. Converts to Apache 2.0 on Feb 17, 2030.
