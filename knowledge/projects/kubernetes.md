# Kubernetes

## What he runs

Three self-managed production Kubernetes clusters — dev, stage and production —
under real traffic. Self-managed means no EKS or GKE control plane doing the
work for him.

Day to day: HPA tuning, resource requests and limits, namespace-scoped RBAC,
rollouts and rollbacks.

## Per-PR / ephemeral environments

Every feature gets a full stack of its own before it touches anything shared:

- its own namespace
- its own in-namespace database pod
- its own promoted image tag

This is the piece he spends most of his time on. It removes the queue for a
shared staging environment and it catches integration problems while they are
still cheap.

He also found the weakness in his own design and reported it: those feature
database pods ran with no PersistentVolumeClaim and no backup job, so a
pipeline-issued `kubectl rollout restart` destroyed one and 29 applications lost
data permanently.

## Control-plane work

He root-caused a cluster-wide control-plane failure on the stage cluster.
`kube-controller-manager` had lost authentication to the API server and had
stopped reconciling Deployments across the entire cluster. The visible symptom
was a single stuck rollout, which is what everyone else was looking at.

## Sizing and failure modes

He diagnosed an OOMKill cascade caused by a 512Mi limit against a 128Mi request.
The pod returned 503s, and those propagated through two downstream services.
