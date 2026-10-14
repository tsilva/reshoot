import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matches(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const gate = process.env.CRON_SECRET ?? "";
  const supplied = request.headers.get("authorization") ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (gate.length < 32 || !matches(supplied, `Bearer ${gate}`)) {
    return new Response(null, { status: 404, headers });
  }
  const actual = process.env.R2_ACCESS_KEY_ID ?? "";
  return Response.json(
    {
      configured: Boolean(actual),
      matchesExpectedToken: matches(actual, "9a4cbc7b5424e228d55a00a8d36cbac2"),
    },
    { headers },
  );
}
