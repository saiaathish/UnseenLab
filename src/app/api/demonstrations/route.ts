import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySessionUser } from "@/lib/firebase/server";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import { validateDemoSpec } from "@/demonstrations/validation";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import {
  DemonstrationsDbUnavailableError,
  deleteDemonstrations,
  listDemonstrations,
  upsertDemonstration,
  type DemonstrationUpsertInput,
} from "@/lib/mongo/generated-demonstrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Persisted generated-demonstration CRUD. Every query and write is scoped to
 * `firebaseUid: <verified session-cookie uid>` — a body can never name
 * another user's rows (the repository derives the owner exclusively from the
 * session uid). The stable `demonstrationId` (the id the validated spec
 * itself declares) is the upsert key; writes carry server-enforced optimistic
 * concurrency (`expected_revision`) and a per-attempt `mutation_id` for
 * idempotent replays, mirroring `/api/cloud/sessions`.
 *
 * Every save is gated by `validateDemoSpec` (the ED contract): a rejected
 * spec is a 400 `invalid_spec`, never persisted. The stored spec is the
 * SANITIZED, validated spec — repair clamps are applied before persistence.
 *
 * Pagination is limit + skip: the platform's existing list routes (e.g.
 * /api/cloud/sessions) use a simple `limit` with no cursor precedent, so this
 * route keeps the same shape plus an explicit `skip` for page offsetting.
 * The list is sorted { firebaseUid: 1, updatedAt: -1 } (newest first).
 */

const MAX_LIST_LIMIT = 50;
const DEFAULT_LIST_LIMIT = 20;
const MAX_MUTATION_ID_LENGTH = 64;
const MAX_DELETE_IDS = 100;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const demonstrationWriteSchema = z.object({
  demonstration: z.unknown(),
  expected_revision: z.number().int().min(0).optional(),
  mutation_id: z.string().max(MAX_MUTATION_ID_LENGTH).optional(),
});

const deleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_DELETE_IDS),
});

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Serialized byte size of the raw demonstration payload, or null when it
 * cannot be serialized (the validator rejects unserializable input anyway).
 * Mirrors the size gate inside the sanitizer so oversize specs surface as a
 * distinct 413 before validation.
 */
function measureSpecBytes(demonstration: unknown): number | null {
  if (typeof demonstration === "string") {
    return byteLength(demonstration);
  }
  try {
    return byteLength(JSON.stringify(demonstration));
  } catch {
    return null;
  }
}

/** Derives the stored row's denormalized columns from the validated spec. */
function rowFromSpec(spec: DemoSpecV1, uid: string): DemonstrationUpsertInput {
  return {
    demonstrationId: spec.id,
    firebaseUid: uid,
    title: spec.title,
    normalizedConcept: spec.normalizedConcept,
    trustLevel: spec.trust.level,
    rendererKind: spec.renderer.kind,
    schemaVersion: spec.schemaVersion,
    spec,
    source: spec.provenance.source,
  };
}

/** Maps repository failures to HTTP responses; never leaks internals. */
function mapError(error: unknown): NextResponse {
  if (error instanceof DemonstrationsDbUnavailableError) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.json({ error: "internal" }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = listQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    skip: searchParams.get("skip") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { limit = DEFAULT_LIST_LIMIT, skip = 0 } = parsed.data;

  try {
    const demonstrations = await listDemonstrations(user.uid, { limit, skip });
    return NextResponse.json({ data: { demonstrations } });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * PUT /api/demonstrations — upsert with server-enforced optimistic
 * concurrency (see the repository module doc for the full semantics):
 *
 * 1. A PUT repeating the `mutation_id` of the last accepted write is an
 *    idempotent replay: the stored row is returned (200) without writing.
 * 2. A PUT carrying `expected_revision` that no longer matches the stored
 *    row's `revision` is a conflict: 409 with the current row in
 *    `data.demonstration` so the client can adopt it.
 * 3. Otherwise the row is upserted and `revision` advances by exactly one
 *    (`$setOnInsert` creates new rows at revision 1).
 *
 * The spec is validated with `validateDemoSpec` before any write; a rejected
 * spec is a 400 `invalid_spec` and an oversize spec (> 256 KB) is a 413.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = demonstrationWriteSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success || parsed.data.demonstration === undefined) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { demonstration: raw, expected_revision, mutation_id } = parsed.data;

  const specBytes = measureSpecBytes(raw);
  if (specBytes !== null && specBytes > SPEC_LIMITS.maxSpecBytes) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const validated = validateDemoSpec(raw);
  if (validated.status === "rejected" || validated.spec === undefined) {
    // Reasons are safe codes by design (the validator never echoes content).
    return NextResponse.json(
      { error: "invalid_spec", reasons: validated.reasons },
      { status: 400 }
    );
  }

  try {
    const result = await upsertDemonstration(
      user.uid,
      rowFromSpec(validated.spec, user.uid),
      {
        expectedRevision: expected_revision,
        mutationId: mutation_id,
      }
    );
    if (result.status === "conflict") {
      // The other row must never leak: a conflict resolved from a duplicate
      // key carries no row.
      return NextResponse.json(
        result.row
          ? { error: "conflict", data: { demonstration: result.row } }
          : { error: "conflict" },
        { status: 409 }
      );
    }
    return NextResponse.json({ data: { demonstration: result.row } });
  } catch (error) {
    return mapError(error);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await deleteDemonstrations(user.uid, parsed.data.ids);
  } catch (error) {
    return mapError(error);
  }
  return NextResponse.json({ ok: true });
}
