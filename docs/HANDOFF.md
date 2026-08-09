# Handoff

## Authoritative state

The default branch remains authoritative. Bootstrap work is proposed through a pull request and
must not be treated as production until reviewed and merged.

## Continue locally

1. Install Node.js 22 or newer.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm db:migrate:local`.
4. Run `pnpm dev` and open `http://127.0.0.1:8787`.
5. Run `pnpm check` and `pnpm test:e2e` before proposing changes.

## Next vertical slice

Implement authentication and tenant-scoped authorization as an explicit application boundary,
then persist the existing synthetic lifecycle through D1 and R2. Maintain the demonstrated
sequence: template → document → version → review → approval → changed version → prior approval
does not apply → audit → export.

Do not introduce production uploads until the content policy, malware-scanning approach, limits,
and authorization model are approved.
