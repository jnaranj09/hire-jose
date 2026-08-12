# Engineering philosophy

## Own the rollback, not just the deploy

Anyone can ship. The job is being able to take it back. Jose has reverted 13
services in one session and resumed the release later from a written runbook.
He does not consider a deploy path finished until the reverse path has been used.

## An incident should only happen once

The deliverable of an incident is not the fix. It is the check that makes the
same class of failure impossible to ship again. That is why post-deploy digest
verification exists in his tooling: an incident showed that pipeline-green did
not mean the pod was actually running the new image.

## Verify the running state, not the pipeline

Green pipelines lie. He checks the tag, the SHA, the running pod's image digest,
and that no stale pods remain. Notifications only fire when all four pass.

## Give every feature its own stack

Shared staging environments hide problems and queue people up. He runs
per-namespace feature environments, each with its own database pod and its own
promoted image tag, so a feature is exercised end to end before it reaches
anything shared.

## Where he draws the line with AI

He uses AI agents to run real production operations, under written rules.

His rule: no procedure without a strong rollback path if the blast radius is
wide. And nothing rare — only work that is repetitive and deterministic.

The interesting part is not that an agent can deploy. It is deciding what it is
not allowed to do.

## Report the system, not the ticket

When a `kubectl rollout restart` wiped a database pod, the ticket was one lost
database. The real finding was that feature-environment databases ran with no
PersistentVolumeClaim and no backup job. He reported the design gap.

## Argue with the obvious fix

A TOCTOU race looked like a missing unique constraint. It was not. The table
deliberately has no constraint, because returning customers legitimately create
new rows. Adding one would have broken production. Knowing why something is
missing is part of the job.
