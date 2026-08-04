# UnseenLab MongoDB schema

The platform data model, replacing the Postgres schema in
`supabase/migrations/20260803193000_platform_schema.sql` (deleted with the
Supabase layer). Collections and indexes are created idempotently by
`scripts/mongo-setup.mjs`; the row contracts below are hand-written types in
`src/lib/mongo/types.ts` and are the source of truth the API routes validate
against (Zod) before any write.

MongoDB is schemaless by nature, so these "rows" are a contract, not an
enforced schema. The API layer enforces shapes, enums, and ownership.

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
| `topic_interests`         | string[]  | ≤ 12 entries, ≤ 500 chars total               |
| `schema_version`          | number    | `>= 1`                                        |
| `created_at`              | string    | ISO-8601 timestamp                            |
| `updated_at`              | string    | ISO-8601 timestamp                            |

Indexes: **unique** `{ user_id: 1 }`.

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

Indexes:

- **unique** `{ id: 1 }`
- `{ user_id: 1 }`
- `{ user_id: 1, lab_slug: 1, status: 1 }`
- `{ user_id: 1, updated_at: -1 }` (dashboard "recent sessions" ordering)

## Access paths

All platform reads/writes go through the cookie-authenticated server routes:

- `GET /api/account`, `PATCH /api/account/profile`,
  `PUT /api/account/preferences`, `DELETE /api/account`
- `GET|PUT|DELETE /api/cloud/sessions`, `POST /api/cloud/sessions/:id/complete`

Pages (`/dashboard`, `/onboarding`, `/settings`) query the collections
directly server-side after `verifySessionUser()`.
