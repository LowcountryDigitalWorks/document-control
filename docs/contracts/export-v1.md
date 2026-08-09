# Application export contract v1

Media type: `application/json`

Discriminator fields:

```json
{
  "format": "ldw.document-control.export",
  "version": 1
}
```

The export contains one tenant and its workspaces, role assignments, documents, document
versions, templates, workflow definitions and instances, approvals, and audit events. IDs and
relationships are preserved. Records are ordered deterministically by the exporter in a future
persistence-backed implementation.

Version 1 exports application records only. R2 binaries are represented by `contentKey` and
`contentHash`; a complete offline package must add a manifest and the corresponding objects,
verify every SHA-256 hash, and reject missing or extra content.

Importers must reject an unknown `format` or `version`, validate all tenant boundaries and
references, and import into an empty tenant or an explicitly mapped target. Import must never
make a prior approval apply to a different version or hash.
