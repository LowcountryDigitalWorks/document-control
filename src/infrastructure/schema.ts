// D1 schema authority
//
// `migrations/0001_initial.sql` is the authoritative executable schema for the
// bootstrap. Keeping the relational constraints, triggers, and indexes in one
// executable source prevents a second schema declaration from silently drifting
// away from the database invariants. A typed query layer may be introduced later
// if it can be generated from, or mechanically verified against, the migration.

export const authoritativeSchemaMigration = "migrations/0001_initial.sql" as const;
