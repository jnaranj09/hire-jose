# Observability

## The stack he runs

He built and runs a multi-node OpenSearch cluster in production: manager nodes
and data nodes, full TLS, internal auth, Dashboards, and Data Prepper pipelines
for both logs and traces. He also wrote a custom Keycloak login theme so people
sign in with their AD account.

Alongside it: OpenTelemetry, Grafana, Prometheus, Loki, Incident.io, PagerDuty.

## Using traces to answer real questions

- He root-caused a race with trace-level timing. One call fired at 19:46:04 UTC.
  The webhook it depended on arrived about 21 seconds later, which exhausted a
  3 × 2s retry budget before the row it needed existed.
- He used APM span data to prove a negative — zero calls to a `DELETE` endpoint
  in 90 days — which corrected a wrong assumption in a design document.

## Logging as a cost problem

One service was missing logs. The cause was not its own config: Loki stream-limit
throttling, triggered by noisy neighbours in the same namespace. That reframed it
as a log-volume and cost problem rather than an application bug.

## Alerts

He carries the pager, runs incidents and writes the follow-up. He also removed a
noisy alert that nobody trusted, which is the other half of the job.
