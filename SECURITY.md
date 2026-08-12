# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposed secret. Contact
`eddie@lowcountrydigitalworks.com` with a concise description, affected revision, reproduction
steps, and impact. Do not include real customer data, PHI, credentials, tokens, or other secrets.

## Current scope

This repository is pre-production. The synthetic demo, foundational domain invariants, application
authorization, and production-readiness architecture are in scope for review.

Production authentication/session management, tenant provisioning, customer uploads, malware
scanning/quarantine, data retention/legal hold, complete backup/recovery, and production customer
infrastructure are not implemented and must not be inferred from product-shaped synthetic routes.
Customer data and PHI are prohibited in the current synthetic/foundation environment.

The engineering threat model is maintained in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). It
records current controls, future mitigations, unresolved decisions, and release gates. It is not a
certification, audit opinion, or compliance determination for HIPAA, CMMC, FedRAMP, SOC 2, or any
other framework.

## Required properties

- Tenant-owned data is always scoped by tenant.
- Authentication source does not grant application authority by itself; application authorization
  requires the appropriate membership/role/permission relationship.
- Approval applicability requires the exact document-version ID and SHA-256 hash.
- Workflow instances and evidence remain pinned to exact workflow-definition versions.
- Controlled template provenance and immutable version identity are preserved.
- Audit events are append-only.
- Secrets are supplied at deploy time and never committed to source control or portable exports.
- Public/synthetic demonstrations contain synthetic data only and accept no arbitrary customer file
  uploads.
- Planned security controls are not described as implemented until they are actually enforced and
  validated.
