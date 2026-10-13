function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ env }) {
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS product_category_overrides (product_id INTEGER PRIMARY KEY, category TEXT NOT NULL CHECK (category IN ('خوراک', 'پیش غذا')))"
    ).run();
    const result = await env.DB.prepare(
      "SELECT p.id, p.name, p.price, COALESCE(o.category, p.category) AS cat FROM products p LEFT JOIN product_category_overrides o ON o.product_id = p.id ORDER BY p.id"
    ).all();
    return json({ ok: true, products: result.results || [] });
  } catch {
    return json({ ok: false, error: "Could not load products" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const price = Number(body.price);
  const cat = body.cat;
  if (!name || name.length > 80 || !Number.isSafeInteger(price) || price < 1 ||
      !["غذا", "خوراک", "پیش غذا", "نوشیدنی", "اضافه‌ها"].includes(cat)) {
    return json({ ok: false, error: "Invalid product fields" }, 400);
  }

  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS product_category_overrides (product_id INTEGER PRIMARY KEY, category TEXT NOT NULL CHECK (category IN ('خوراک', 'پیش غذا')))"
    ).run();
    // Keep compatibility with databases whose original category CHECK only permits the legacy values.
    const storedCategory = ["خوراک", "پیش غذا"].includes(cat) ? "غذا" : cat;
    const result = await env.DB.prepare(
      "INSERT INTO products (name, price, category) VALUES (?, ?, ?)"
    ).bind(name, price, storedCategory).run();
    const id = Number(result.meta.last_row_id);
    if (storedCategory !== cat) {
      await env.DB.prepare(
        "INSERT INTO product_category_overrides (product_id, category) VALUES (?, ?)"
      ).bind(id, cat).run();
    }
    return json({
      ok: true,
      product: { id, name, price, cat }
    }, 201);
  } catch {
    return json({ ok: false, error: "Could not save product" }, 500);
  }
}
