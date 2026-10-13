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
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS product_category_overrides (product_id INTEGER PRIMARY KEY, category TEXT NOT NULL CHECK (category IN ('خوراک', 'پیش غذا')))"
    ).run();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM product_category_overrides WHERE product_id = ?").bind(id),
      env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id)
    ]);
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "Could not delete product" }, 500);
  }
}
