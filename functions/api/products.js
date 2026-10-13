function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(
      "SELECT id, name, price, category AS cat FROM products ORDER BY id"
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
    const result = await env.DB.prepare(
      "INSERT INTO products (name, price, category) VALUES (?, ?, ?)"
    ).bind(name, price, cat).run();
    return json({
      ok: true,
      product: { id: Number(result.meta.last_row_id), name, price, cat }
    }, 201);
  } catch {
    return json({ ok: false, error: "Could not save product" }, 500);
  }
}
