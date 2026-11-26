# CI and local security checks

GitHub Actions runs three independent jobs on every push and pull request:
Node app tests, Semgrep SAST, and Trivy software-composition analysis (SCA).
The workflow uses read-only repository permissions, does not require secrets,
and does not use `pull_request_target`.

## Run locally

From the repository root:

```sh
npm ci
npm test
```

Semgrep OSS requires Python/pip and the project rules (added separately):

```sh
python -m pip install semgrep==1.186.0
semgrep --test rules/
semgrep scan --config rules/ --error --json --output semgrep.json server/ public/
```

Trivy is an optional local dependency. Install its CLI using the official
Trivy installation instructions, then run a filesystem scan from the root:

```sh
trivy fs --scanners vuln --exit-code 1 --format json --output trivy.json .
```

Both scanner reports are written as `semgrep.json` and `trivy.json`; GitHub
Actions uploads them as artifacts even when a scan fails. A missing local
scanner is not a substitute for the corresponding CI check.

## Intentional baseline finding

The training baseline intentionally pins vulnerable `lodash@4.17.20` so the
SCA workflow has a known finding to detect. The application source scan is
limited to `server/` and `public/`. Do not deploy the vulnerable baseline
publicly; deploy only the revision after both fixes.
