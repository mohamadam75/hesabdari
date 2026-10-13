function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestDelete({ params, env }) {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return json({ ok: false, error: "Invalid product id" }, 400);
  }
  try {
    await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "Could not delete product" }, 500);
  }
}
