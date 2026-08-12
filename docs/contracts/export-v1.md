# Application export contract v1

Media type: `application/json`

Discriminator fields:

```json
{
  "format": "ldw.document-control.export",
  "version": 1
}
```

## Application records

Version 1 contains one tenant and the portable application state needed to reconstruct its
controlled-document relationships without relying on a vendor database:

- tenant identity;
- permitted-data profile, branding configuration, and terminology configuration;
- provider-neutral identity subjects without credentials or secrets;
- tenant memberships;
- workspaces;
- role definitions and scoped role bindings;
- documents and immutable document-version evidence;
- templates and template versions, lifecycle, source hashes, and provenance;
- versioned workflow definitions and workflow instances;
- reviews;
- exact-version approvals;
- append-only audit events;
- storage provider references, content keys, and canonical SHA-256 hashes.

IDs and relationships are preserved. Persistence-backed exporters should emit deterministic record
ordering so two exports of the same application state can be meaningfully compared.

## Validation

An importer must reject an export before persistence if any of these conditions is true:

- `format` or `version` is unsupported;
- a required top-level record collection is absent or has the wrong shape;
- a tenant-owned record crosses the exported tenant boundary;
- a referenced subject, workspace, document, document version, template version, workflow
  definition, or workflow instance is missing;
- a document claims approved-template provenance but its exact template ID/version/hash does not
  exist in the package;
- a workflow instance names a state outside its bound workflow-definition version;
- an approval's version ID, content hash, workflow instance, or workflow-definition version does
  not match the referenced evidence;
- a canonical content hash is malformed.

Import should target an empty tenant or an explicitly reviewed mapping. Import must never rewrite
an approval so that it applies to different bytes, a different version, or a different workflow.

## Binary portability

Version 1 JSON exports application records only. R2 or SharePoint binaries are represented by
`contentProvider`, `contentKey`, and `contentHash` on the corresponding version records.

A complete future offline package will wrap the application export in a portable bundle such as:

```text
manifest.json
application.json
documents/
  <content objects, when requested>
```

The manifest will identify the export-contract version, every bundled object, the logical storage
reference, byte size, and canonical SHA-256 hash. Import must verify every declared object, reject
missing or unexpected objects, and never trust filename/path metadata as evidence of content
identity.

Bundling binaries remains optional so a customer can export application state without being forced
to duplicate documents that intentionally remain in customer-owned SharePoint or another approved
content store.

### Document-version change summary

`documentVersions[].changeSummary` is an additive optional v1 field. Current exports include the bounded immutable summary stored with each exact document version. Parsers continue accepting older v1 packages that predate the field; when the field is present it must satisfy the current 3–500 character plain-text validation contract.
