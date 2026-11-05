// Retired: a client-selected success must never grant credits.
export async function POST() {
  return Response.json({ error: {
    code: "checkout_replaced", message: "Open Credits to continue with Stripe test checkout.",
  } }, { status: 410 });
}
