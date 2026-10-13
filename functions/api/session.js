export async function onRequestGet() {
  return Response.json(
    { ok: true, authenticated: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
