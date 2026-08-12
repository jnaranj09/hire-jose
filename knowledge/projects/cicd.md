# CI/CD and release engineering

## Platform

GitLab CI in production, with self-hosted runners. GitHub Actions on personal
projects.

He built and extracted GitLab CI pipeline templates into a shared reusable
library of 20+ templates, including a 3-repo build → deploy → config chain for a
partner-facing portal.

## Tag promotion

Releases move by promoting the same tag across environments. Post-deploy, the
image digest is checked so the environments cannot drift apart.

Real numbers:

- 16-service release train merged, tagged and deployed in one session, then
  promoted to production two days later with zero version drift
- 7-service batch promoted to production, all healthy, zero pod restarts
- one feature tag redeployed across 20 services in a single rollout

## Post-deploy verification

He formalized a 4-step check and wired it into the deploy tooling:

1. the tag contains the expected changes
2. the pipeline SHA matches the tag's SHA
3. the running pod's digest matches the pipeline-built digest
4. no stale pods remain

Success notifications now fire only when all four pass. Before, they fired on
pipeline success alone, with nothing confirming the running pod matched the new
build.

## Rollback

He reverted 13 services from feature tags back to their previous release tags in
one session — every pipeline green and verified in-cluster, plus two config
flips — and resumed the release later from a written runbook.

## A CI bug worth telling

A shared pipeline template used a folded YAML block scalar (`- >`). Inside a
folded scalar, `#` does not start a comment, so a `#` line swallowed the seven
`export` statements that followed it. Seven public DNS variables were empty in
every environment, fleet-wide. The fix was `>` to `|`.

## AI in the deploy path

He authored an 11-skill operations library that AI agents consume to run real
production deploys, merges, tag promotion and environment config changes. It is
in daily use by him and his team.

The rules that bound it: no procedure without a strong rollback path when the
blast radius is wide, and nothing rare — only repetitive, deterministic work.
