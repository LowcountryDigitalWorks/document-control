# ADR 0004 — Staged content ingestion state and integrity

- Status: Accepted
- Date: 2026-08-13

## Context

Document Control already has D1/SQLite application state, a provider-neutral `ContentStore`, immutable R2 object creation, application-owned content keys, and SHA-256 verification on stored-object reads. Those primitives do not define when caller-supplied bytes become authoritative document content. D1 and object storage also cannot participate in one cross-service transaction.

## Decision

Content ingestion is a separate application-owned lifecycle in D1/SQLite. Binary bytes remain behind the existing `ContentStore` port.

The sequence is:

1. current application authorization approves `document.version.create` at tenant/workspace scope;
2. the server creates the intake identifier and scoped object key without using the caller filename;
3. bounded untrusted metadata is recorded as `intake_initiated`;
4. byte length and SHA-256 are computed and persisted before storage, without claiming the object exists;
5. immutable bytes are staged as `application/octet-stream`;
6. D1 records `staged`, then `validation_pending`;
7. an injected validation policy records `accepted` with an authoritative accepted media type or records `rejected`;
8. retrieval requires current `document.read`, `accepted` state, and successful expected-SHA-256 verification by `ContentStore`.

Important lifecycle audit evidence is emitted by D1/SQLite triggers from the authoritative row in the same database statement as the evidence change. This avoids a D1 state transition succeeding without its matching audit fact.

`accepted` means only that the configured ingestion validation policy accepted the candidate. It does **not** mean malware-clean, safe-to-open, OCR-processed, approved, or promoted to a document version.

If object storage succeeds but D1 cannot record `staged`, D1 already owns the exact key, expected SHA-256, and byte length. Recovery verifies that exact object before resuming. Missing or integrity-mismatched objects fail closed.

## Consequences

- D1 remains authoritative for tenant/workspace/initiating-subject ownership and lifecycle state.
- SHA-256 remains the authoritative stored-content integrity mechanism.
- Caller filenames and declared media types remain untrusted metadata.
- R2 remains an adapter, not an authorization boundary or source of tenant ownership.
- Rejected/failed staged bytes are unavailable but not automatically deleted because retention, legal-hold, quarantine, and destructive disposition policy are not authorized here.
- No public upload route, production validator, malware scanner, or production content-ingestion composition is enabled.
- Future document-version promotion must explicitly consume an accepted intake; acceptance itself does not create or mutate `document_versions`.
