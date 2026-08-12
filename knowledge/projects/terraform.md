# Terraform and cloud

## AWS PrivateLink

Jose authored and applied the Terraform that exposed an internal GitLab instance
to Snowflake over AWS PrivateLink. That is the full path:

- VPC endpoint service
- internal Network Load Balancer
- target group
- listener
- security group

Authored and applied, not reviewed. He owned it end to end.

## Other AWS work

S3, IAM, EC2, Transit Gateway and Site-to-Site VPN, integrated with the same
internal network.

## Cloudflare

Cloudflare DNS and Cloudflare Tunnel (`cloudflared`) for self-hosted services
over TLS. His personal site, josenaranjo.website, runs this way — served from
his own machine with no cloud host in front of it.

## Honest scope

Terraform at Jose's work is used for targeted, real pieces of AWS networking,
not for a whole cloud estate. Most of his production surface is Kubernetes and
GitLab CI, not a large Terraform monorepo.
