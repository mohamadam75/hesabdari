function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}


export async function onRequestPatch({ request, params, env }) {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return json({ ok: false, error: "Invalid product id" }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const price = Number(body.price);
  const cat = body.cat;
  const categories = ["غذا", "خوراک", "پیش غذا", "نوشیدنی", "اضافه‌ها"];
  if (!name || name.length > 80 || !Number.isSafeInteger(price) || price < 1 || !categories.includes(cat)) {
    return json({ ok: false, error: "Invalid product fields" }, 400);
  }
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_category_overrides (product_id INTEGER PRIMARY KEY, category TEXT NOT NULL CHECK (category IN ('خوراک', 'پیش غذا')))").run();
    const existing = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
    if (!existing) return json({ ok: false, error: "Product not found" }, 404);
    const storedCategory = ["خوراک", "پیش غذا"].includes(cat) ? "غذا" : cat;
    await env.DB.batch([
      env.DB.prepare("UPDATE products SET name = ?, price = ?, category = ? WHERE id = ?").bind(name, price, storedCategory, id),
      ...(["خوراک", "پیش غذا"].includes(cat)
        ? [env.DB.prepare("INSERT INTO product_category_overrides (product_id, category) VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET category = excluded.category").bind(id, cat)]
        : [env.DB.prepare("DELETE FROM product_category_overrides WHERE product_id = ?").bind(id)])
    ]);
    return json({ ok: true, product: { id, name, price, cat } });
  } catch {
    return json({ ok: false, error: "Could not update product" }, 500);
  }
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
