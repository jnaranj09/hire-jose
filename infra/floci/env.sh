# source this before running aws/kubectl against the local floci emulator:
#   source infra/floci/env.sh
#
# The credentials are dummies. floci is an emulator — there is no real
# AWS account behind them and nothing here can reach real AWS.

export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

# Keep this cluster out of ~/.kube/config so real work contexts stay untouched.
export KUBECONFIG=$HOME/.kube/floci.config

export FLOCI_CLUSTER_NAME=hire-jose
