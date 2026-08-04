# UnseenLab MongoDB schema

The platform data model, replacing the Postgres schema in
`supabase/migrations/20260803193000_platform_schema.sql` (deleted with the
Supabase layer). Collections, indexes, and `$jsonSchema` validators are
created idempotently by `scripts/mongo-setup.mjs`; the row contracts below
are hand-written types in `src/lib/mongo/types.ts` and are the source of
truth the API routes validate against (Zod) before any write.

MongoDB is schemaless by nature, so these "rows" are a contract. Since the
overnight-90 work, each collection also carries a `$jsonSchema` validator
(`validationLevel: "strict"`) installed by `scripts/mongo-setup.mjs` (via
`createCollection` options when a collection is new, `collMod` otherwise).
**The validators are defense-in-depth only**: Zod validation at the API
boundary (the route schemas + `src/lib/mongo/types.ts`) remains the primary
validation layer, and the DB validator exists to catch bugs that slip past
it. All validators set `additionalProperties: true` so future additive
fields never break writes.

BSON note: the Node driver serializes safe JS integers as BSON Int32, so
integer fields are typed `int` in the validators and bounded number fields
accept `["double","int"]`.

## Ownership model (replaces RLS)

There is **no row-level security** in MongoDB. Ownership is enforced entirely
by the API layer: every route verifies the `unseenlab.session` cookie
(firebase-admin `verifySessionCookie(cookie, true)`) and derives `user_id`
from the verified UID. A `user_id` from a request body is always rejected.
Reads and writes never accept `_id` from clients (it is driver-managed), and
reads must not leak it.

## Collections

### `profiles`

One row per user (Firebase Auth UID = `user_id`). Created lazily by the
server on first sign-in and by `scripts/e2e-seed-auth.mjs` for test users.

| field                    | type      | notes                                              |
| ------------------------ | --------- | -------------------------------------------------- |
| `user_id`                | string    | Firebase Auth UID; unique; never from request body |
| `display_name`           | string\|null | 1–60 chars when set, clamped server-side        |
| `avatar_url`             | string\|null | https or http://localhost only, ≤ 2048 chars    |
| `onboarding_version`     | number    | `>= 0`; `1` = complete, gates /dashboard routing   |
| `onboarding_completed_at`| string\|null | ISO-8601 timestamp                              |
| `created_at`             | string    | ISO-8601 timestamp                                  |
| `updated_at`             | string    | ISO-8601 timestamp                                  |

Indexes: **unique** `{ user_id: 1 }`.

DB validator (`$jsonSchema`, strict):

- `user_id`: string — **required**
- `display_name`: `string` \| `null`
- `avatar_url`: `string` \| `null`
- `onboarding_version`: int ≥ 0
- `onboarding_completed_at`: `string` \| `null`
- `created_at`, `updated_at`: string — **required**
- `additionalProperties: true`

### `learner_preferences`

One row per user; full-row upsert keyed by `user_id`.

| field                     | type      | notes                                        |
| ------------------------- | --------- | -------------------------------------------- |
| `user_id`                 | string    | Firebase Auth UID; unique; never from body   |
| `learning_goal`           | string    | `understand_concept` \| `prepare_for_class` \| `explore_experiments` |
| `preferred_representation`| string    | `animation` \| `graph` \| `equation` \| `causal` \| `plain_language` |
| `explanation_style`       | string    | `visual_first` \| `step_by_step` \| `concise` |
| `learning_pace`           | string    | `calm` \| `balanced` \| `quick`               |
| `animation_speed`         | number    | 0.25 – 2                                      |
| `information_density`     | string    | `low` \| `medium` \| `full`                   |
| `reduced_motion`          | boolean   |                                               |
| `high_contrast`           | boolean   |                                               |
| `text_scale`              | number    | 1 – 1.5                                       |
| `one_variable_mode`       | boolean   |                                               |
| `topic_interests`         | string[]  | ≤ 12 entries, each ≤ 80 chars (validator-enforced) |
| `schema_version`          | number    | `>= 1`                                        |
| `created_at`              | string    | ISO-8601 timestamp                            |
| `updated_at`              | string    | ISO-8601 timestamp                            |

Indexes: **unique** `{ user_id: 1 }`.

DB validator (`$jsonSchema`, strict):

- `user_id`: string — **required** (the only required field)
- `learning_goal`: enum `understand_concept` \| `prepare_for_class` \| `explore_experiments`
- `preferred_representation`: enum `animation` \| `graph` \| `equation` \| `causal` \| `plain_language`
- `explanation_style`: enum `visual_first` \| `step_by_step` \| `concise`
- `learning_pace`: enum `calm` \| `balanced` \| `quick`
- `animation_speed`: `double` \| `int`, 0.25 – 2
- `information_density`: enum `low` \| `medium` \| `full`
- `reduced_motion`, `high_contrast`, `one_variable_mode`: bool
- `text_scale`: `double` \| `int`, 1 – 1.5
- `topic_interests`: array, ≤ 12 items, each item string ≤ 80 chars
- `schema_version`: int ≥ 1
- `created_at`, `updated_at`: string
- `additionalProperties: true`

### `learning_sessions`

Cloud-saved lab sessions; `id` is a stable session id shared with the
client's localStorage (`unseenlab.session-id.v1`) so resume is id-for-id.

| field           | type                | notes                                              |
| --------------- | ------------------- | -------------------------------------------------- |
| `id`            | string              | stable session id (UUID format); unique            |
| `user_id`       | string              | Firebase Auth UID; never from request body         |
| `lab_slug`      | string              | `nuclear-chain-reaction` (only registered lab)     |
| `status`        | string              | `active` \| `complete`                             |
| `title`         | string              | 1–120 chars                                        |
| `schema_version`| number              | `>= 1`                                             |
| `evidence`      | object              | full `SessionEvidence` snapshot (Zod-validated)    |
| `workflow`      | object              | workflow state snapshot                            |
| `created_at`    | string              | ISO-8601 timestamp                                 |
| `updated_at`    | string              | ISO-8601 timestamp                                 |
| `completed_at`  | string \| null      | ISO-8601 timestamp when `status` becomes `complete`|
| `revision`      | number (optional)   | optimistic concurrency counter (added by a parallel workstream) |
| `last_client_mutation_id` | string \| null (optional) | idempotency key for client mutations (parallel workstream) |

Indexes:

- **unique** `{ id: 1 }`
- `{ user_id: 1 }`
- `{ user_id: 1, lab_slug: 1, status: 1 }`
- `{ user_id: 1, updated_at: -1 }` (dashboard "recent sessions" ordering)

DB validator (`$jsonSchema`, strict):

- `id`, `user_id`, `lab_slug`: string — **required**
- `status`: enum `active` \| `complete`
- `title`: string ≤ 120 chars
- `schema_version`: int ≥ 1
- `evidence`, `workflow`: object
- `revision`: int ≥ 0 — **optional** (pre-existing docs may lack it)
- `last_client_mutation_id`: `string` \| `null` — **optional** (same reason)
- `created_at`, `updated_at`: string — **required**
- `completed_at`: `string` \| `null`
- `additionalProperties: true`

## Access paths

All platform reads/writes go through the cookie-authenticated server routes:

- `GET /api/account`, `PATCH /api/account/profile`,
  `PUT /api/account/preferences`, `DELETE /api/account`
- `GET|PUT|DELETE /api/cloud/sessions`, `POST /api/cloud/sessions/:id/complete`

Pages (`/dashboard`, `/onboarding`, `/settings`) query the collections
directly server-side after `verifySessionUser()`.

## Query plans (measured)

Measured 2026-08-03 against the live Atlas cluster with
`scripts/explain-plans.mjs` (`explain("executionStats")`), using a sentinel
(non-existent) `user_id` so no real data is touched. `totalDocsExamined` and
`executionTimeMillis` are therefore for the empty-result path — the index
choice and stage trees are the real signal. **Every shape is fully covered by
an index; no shape COLLSCANs.**

| # | query shape | winning plan (stages) | index used | totalDocsExamined | executionTimeMillis |
| - | ----------- | --------------------- | ---------- | ----------------- | ------------------- |
| 1 | `find({ user_id }).sort({ updated_at: -1 }).limit(10)` (latest sessions) | `LIMIT` → `FETCH` → `IXSCAN` | `user_id_1_updated_at_-1` | 0 | 0 |
| 2 | `find({ user_id, lab_slug: "nuclear-chain-reaction", status: "active" }).sort({ updated_at: -1 }).limit(1)` (incomplete session for a lab) | `LIMIT` → `FETCH` → `IXSCAN` | `user_id_1_updated_at_-1` | 0 | 0 |
| 3 | `findOne({ id, user_id })` (exact resume; explained as `find(...).limit(1)`) | `LIMIT` → `FETCH` → `IXSCAN` | `id_1` | 0 | 0 |
| 4 | `deleteMany({ user_id })` (user data deletion; plan proxied by `find({ user_id })`) | `FETCH` → `IXSCAN` | `user_id_1` | 0 | 0 |

Notes:

- Shape 2 has a dedicated `user_id_1_lab_slug_1_status_1` index for the
  equality predicates; for the empty sentinel result the optimizer prefers
  `user_id_1_updated_at_-1` because it also covers the `updated_at` sort and
  skips a `SORT` stage. Either index keeps the query IXSCAN-only.
- Shape 3 resolves on the unique `id_1` index (at most one doc), then filters
  `user_id` as a post-index predicate inside `FETCH`.
- Shape 4 (`deleteMany`) is explained via the equivalent `find({ user_id })`
  — same predicate, same index path (`user_id_1`).
- All four plans had `totalKeysExamined: 0` with the sentinel; expect the
  same stage trees with real data.

## Optimistic concurrency (`learning_sessions` writes)

Every accepted write advances `revision` by exactly one (the PUT upsert sets
`(existing.revision ?? 0) + 1` and records `last_client_mutation_id`; the
complete route uses `$inc: { revision: 1 }`). Legacy rows without a `revision`
count as 0, so the first concurrency-aware write lands normally and heals the
row.

`PUT /api/cloud/sessions` accepts two optional fields:

- `expected_revision` (int ≥ 0): the revision the client last read. If the
  stored row's revision no longer matches, the server answers
  **409** `{ "error": "conflict", "data": { "session": <current row> } }`
  and does not write — the client adopts `data.session` instead of
  overwriting it.
- `mutation_id` (string ≤ 64): a per-attempt idempotency key. A PUT repeating
  the stored `last_client_mutation_id` is an acknowledged replay: the server
  returns the stored row (200) **without writing**.

The client (CloudSessionSync) treats a 409 exactly like its existing
evidence-time "cloud is newer" outcome: the local unsynced copy is kept and
the cloud copy wins. Both fields are wire-only — they are never stored
(only `revision` and `last_client_mutation_id` are persisted) — and neither
ever carries `user_id`; ownership still comes solely from the verified
session cookie.
