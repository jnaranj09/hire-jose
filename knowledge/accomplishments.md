# Accomplishments

## Release engineering and rollback

- Merged, tagged and deployed a 16-service release train to a shared environment
  in one session, each with post-deploy image-digest verification. Promoted the
  same 16 to production two days later with zero version drift.
- Promoted a 7-service batch to production, all verified healthy, zero pod
  restarts.
- Reverted 13 services from feature tags back to their previous release tags in
  a single session. Every pipeline green and verified in-cluster, plus two config
  flips, then resumed the release later from a written runbook. This is the
  rollback path he trusts, because he has used it.
- Redeployed a feature tag across 20 services in one rollout.

## Incidents and root cause

- Root-caused a cluster-wide control-plane failure. `kube-controller-manager` had
  lost authentication to the API server and had stopped reconciling Deployments
  across the whole stage cluster. One stuck rollout was the symptom everyone was
  watching. The control plane was the cause.
- Found a fleet-wide CI bug caused by a YAML folding rule. A shared pipeline
  template used a folded block scalar (`- >`), so a `#` line inside the fold
  swallowed the seven `export` statements after it, because `#` does not start a
  comment inside a folded scalar. Seven public DNS variables were empty in every
  environment, fleet-wide. The fix was one character: `>` became `|`.
- Traced service 500s to a pipeline-issued `kubectl rollout restart` that wiped a
  feature-environment Postgres pod, because those database pods ran with no
  PersistentVolumeClaim and no backup job. 29 applications lost data permanently.
  He reported the systemic design gap, not just the incident.
- Root-caused a TOCTOU race and argued against the obvious fix. The table
  deliberately has no unique constraint, because returning customers legitimately
  create new rows. Adding one would have broken production.
- Diagnosed an OOMKill cascade: a 512Mi limit against a 128Mi request, returning
  503s that propagated through two downstream services.
- After 13 consecutive pipeline failures at the identical step, he proved it was
  not a code bug. The next run passed with no code change. Stale developer
  databases were the cause. That became a triage heuristic.

## Turning incidents into permanent practice

- Formalized a 4-step post-deploy image verification procedure and wired it into
  the deploy tooling:

  1. the tag contains the expected changes
  2. the pipeline SHA matches the tag's SHA
  3. the running pod's digest matches the pipeline-built digest
  4. no stale pods remain

  Success notifications are now gated on all four passing. Before that they fired
  on pipeline success alone, with no check that the running pod reflected the new
  build.

  What prompted it: a pipeline reported success while the running pod was still
  serving the old image.

## Security found from the infrastructure side

- Found a tenant-wide private-chat exposure, rated High. A tool holding
  application-level Microsoft Graph permissions could list and read any user's
  private 1:1 and group chats given only their directory object id. He noticed
  it, reproduced it deliberately, and reported it to IT.
- Found an authentication bypass on a destructive endpoint: a `DELETE` that
  accepted a bogus bearer token and executed anyway, returning HTTP 200. Root
  cause was three missing auth config keys.
- Found credentials committed to git history (database passwords, an admin
  password, a client secret) and access tokens in plaintext across 5 local git
  remote URLs. Drove the rotation and a credential-helper fix.
- Found a verification script that leaked 54 live client secrets to a terminal
  and a transcript, because a backup file sat inside a globbed directory. Fixed
  the glob.
- Shipped a SOQL-injection fix.

## Internal developer tooling, built as products

- Authored an 11-skill operations library, consumed by AI agents, that runs real
  production deploys, merges, tag promotion and environment config changes. In
  daily use by him and his team.
- Built a self-service config diff tool. A coworker makes a change in an admin
  console and gets back a report naming the exact config file and line to edit.
  It ships with a self-test CI job that sweeps all 5 config sets against a
  known-in-sync environment, to catch tool bugs before they reach a coworker's
  report. Its exception allowlist was driven to zero. Later extended with an
  8-worker parallel fetch to close a coverage blind spot.
- Built a CLI to automate Salesforce email-deliverability settings, adopted by
  other people at work.
- Built Salesforce developer-sandbox automation, 47 commits over 6 months, so
  developers get their own environment without filing a manual request.

## Build versus buy

- Evaluated building a bespoke service against adopting an existing one, chose
  self-hosted n8n, and shipped a production document-ingestion and file-upload
  workflow that replaced a paid third-party product and removed the recurring
  license entirely.
- Root-caused missing logs for one service down to Loki stream-limit throttling
  caused by noisy neighbours in the same namespace, not the service's own config.
  A log-volume and cost problem, not an application bug.
