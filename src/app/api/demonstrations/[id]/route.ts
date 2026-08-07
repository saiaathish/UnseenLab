import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySessionUser } from "@/lib/firebase/server";
import {
  DemonstrationsDbUnavailableError,
  deleteDemonstrations,
  findDemonstration,
} from "@/lib/mongo/generated-demonstrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Id-scoped demonstration reads/deletes. Every query is scoped to
 * `firebaseUid: <verified session-cookie uid>` — an id owned by another user
 * reads as null and can never be deleted. Mirrors the dynamic-route pattern
 * of /api/cloud/sessions/<id>/complete (Next 16 async params).
 */

const idSchema = z.string().min(1);

function mapError(error: unknown): NextResponse {
  if (error instanceof DemonstrationsDbUnavailableError) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.json({ error: "internal" }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const demonstration = await findDemonstration(user.uid, id);
    return NextResponse.json({ data: { demonstration } });
  } catch (error) {
    return mapError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    // Deleting an id that does not exist (or belongs to another user) is not
    // an error for the caller — the delete simply matches nothing.
    await deleteDemonstrations(user.uid, [id]);
  } catch (error) {
    return mapError(error);
  }
  return NextResponse.json({ ok: true });
}
