export async function POST() {
  return Response.json({ error: { code: "topups_retired", message: "One-time top-ups are no longer offered. Open Plan & usage to choose a monthly plan." } }, { status: 410 });
}
