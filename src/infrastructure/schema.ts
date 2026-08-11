// D1 schema authority
//
// The ordered SQL files under `migrations/` are the authoritative executable D1
// schema. Keeping relational constraints, triggers, and indexes in executable
// migrations prevents a second schema declaration from silently drifting away from
// database invariants. A typed query layer may be introduced later if it can be
// generated from, or mechanically verified against, the migration sequence.

export const authoritativeSchemaMigrations = "migrations/*.sql" as const;
