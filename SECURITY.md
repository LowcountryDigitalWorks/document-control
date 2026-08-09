# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposed secret. Contact
`eddie@lowcountrydigitalworks.com` with a concise description, affected revision, reproduction
steps, and impact. Do not include real customer data.

## Current scope

This repository is pre-production. The synthetic demo and foundational domain invariants are in
scope for review. Production authentication, customer uploads, data retention, backup, malware
scanning, and enterprise integrations are not yet implemented and must not be inferred from the
demo.

## Required properties

- Tenant-owned data is always scoped by tenant.
- Approval applicability requires the exact document-version ID and SHA-256 hash.
- Audit events are append-only.
- Secrets are supplied at deploy time and never committed.
- Public demonstrations contain synthetic data only.
