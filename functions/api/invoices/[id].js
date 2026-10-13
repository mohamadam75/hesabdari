function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function ensureDiscountColumn(env) {
  try { await env.DB.prepare("ALTER TABLE invoices ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0)").run(); }
  catch (error) { if (!String(error && error.message || "").toLowerCase().includes("duplicate column")) throw error; }
}

function cleanInvoice(body) {
  const date = typeof body.date === "string" ? body.date : "";
  const payment = typeof body.payment === "string" ? body.payment : "";
  const customer = typeof body.customer === "string" ? body.customer.trim().slice(0, 120) : "";
  const items = Array.isArray(body.items) ? body.items : [];
  const discount = Number(body.discount ?? 0);
  if (!Number.isSafeInteger(discount) || discount < 0) return { error: "Invalid discount amount" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !["کارت‌خوان", "نقدی", "کارت‌به‌کارت", "سایر"].includes(payment) ||
      items.length < 1 || items.length > 100) return { error: "Invalid invoice fields" };

  let total = 0, count = 0;
  const cleanItems = [];
  for (const item of items) {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const price = Number(item.price), qty = Number(item.qty);
    if (!name || name.length > 120 || !Number.isSafeInteger(price) || price < 0 ||
        !Number.isSafeInteger(qty) || qty < 1 || qty > 10000) return { error: "Invalid invoice item" };
    const lineTotal = price * qty;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) return { error: "Invoice amount is too large" };
    total += lineTotal; count += qty;
    cleanItems.push({ name, price, qty, lineTotal });
  }
  if (discount > total) return { error: "Discount cannot exceed subtotal" };
  return { date, payment, customer, items: cleanItems, total: total - discount, subtotal: total, discount, count };
}

export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return json({ ok: false, error: "Invalid invoice id" }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const invoice = cleanInvoice(body);
  if (invoice.error) return json({ ok: false, error: invoice.error }, 400);

  try {
    await ensureDiscountColumn(env);
    const existing = await env.DB.prepare("SELECT id FROM invoices WHERE id = ?").bind(id).first();
    if (!existing) return json({ ok: false, error: "Invoice not found" }, 404);
    await env.DB.batch([
      env.DB.prepare("UPDATE invoices SET invoice_date = ?, payment_method = ?, customer_name = ?, total_amount = ?, item_count = ?, discount_amount = ? WHERE id = ?")
        .bind(invoice.date, invoice.payment, invoice.customer || null, invoice.total, invoice.count, invoice.discount, id),
      env.DB.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").bind(id),
      ...invoice.items.map(item => env.DB.prepare(
        "INSERT INTO invoice_items (invoice_id, product_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?)"
      ).bind(id, item.name, item.price, item.qty, item.lineTotal))
    ]);
    return json({ ok: true, id, total: invoice.total, discount: invoice.discount, count: invoice.count });
  } catch {
    return json({ ok: false, error: "Could not update invoice" }, 500);
  }
}

export async function onRequestDelete({ env, params }) {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return json({ ok: false, error: "Invalid invoice id" }, 400);
  try {
    const existing = await env.DB.prepare("SELECT id FROM invoices WHERE id = ?").bind(id).first();
    if (!existing) return json({ ok: false, error: "Invoice not found" }, 404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").bind(id),
      env.DB.prepare("DELETE FROM invoices WHERE id = ?").bind(id)
    ]);
    return json({ ok: true, id });
  } catch {
    return json({ ok: false, error: "Could not delete invoice" }, 500);
  }
}
