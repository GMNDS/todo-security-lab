# Security lab pull-request demonstration

The repository intentionally starts with a vulnerable training baseline. The
workflow runs app tests, Semgrep SAST, and Trivy SCA as separate required checks
on pushes and pull requests.

## Baseline: red / red

On the baseline, the Semgrep job is expected to report SQLi and stored XSS;
the Trivy job is expected to report the pinned
`lodash@4.17.20` dependency. Trivy checks all severities, so the known fixture
is reported even if an advisory's severity classification changes. The Node
application test job is separate from these security checks.

## PR 1: SAST green / SCA red

The first stacked pull request fixes SQLi and XSS without changing
the intentionally vulnerable training dependency. Semgrep should pass while
Trivy remains red. If both security checks are required branch-protection
checks, this pull request cannot merge while SCA is red. This is intentional:
the first PR demonstrates that independently passing SAST does not waive the
dependency finding.

## PR 2: green / green

The second stacked pull request updates/removes the vulnerable dependency.
After it is applied on top of PR 1, Semgrep and Trivy should both pass. The
public application paths (`server/` and `public/`) are the scan target; the
vulnerable example fixtures remain training material and are not the secure
public application.
