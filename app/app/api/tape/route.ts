import { tapeSnapshot } from "db";
import { publicError } from "../public-error";

// Live ledger read — always dynamic, the tape must never serve stale rows.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await tapeSnapshot(50);
    return Response.json(snapshot);
  } catch (err) {
    return Response.json({ error: publicError("api/tape", err) }, { status: 500 });
  }
}
