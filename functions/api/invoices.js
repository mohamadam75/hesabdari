function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function ensureDiscountColumn(env) {
  try { await env.DB.prepare("ALTER TABLE invoices ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0)").run(); }
  catch (error) {
    if (!String(error && error.message || "").toLowerCase().includes("duplicate column")) throw error;
  }
}

export async function onRequestGet({ env }) {
  try {
    await ensureDiscountColumn(env);
    const result = await env.DB.prepare(
      "SELECT id, invoice_number AS no, invoice_date AS date, payment_method AS payment, customer_name AS customer, total_amount AS total, discount_amount AS discount, item_count AS count FROM invoices ORDER BY id DESC LIMIT 200"
    ).all();
    const invoices = result.results || [];
    for (const invoice of invoices) {
      const items = await env.DB.prepare(
        "SELECT product_name AS name, unit_price AS price, quantity AS qty, line_total AS lineTotal FROM invoice_items WHERE invoice_id = ? ORDER BY id"
      ).bind(invoice.id).all();
      invoice.items = items.results || [];
    }
    return json({ ok: true, invoices });
  } catch {
    return json({ ok: false, error: "Could not load invoices" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const no = Number(body.no);
  const date = typeof body.date === "string" ? body.date : "";
  const payment = typeof body.payment === "string" ? body.payment : "";
  const customer = typeof body.customer === "string" ? body.customer.trim().slice(0, 120) : "";
  const items = Array.isArray(body.items) ? body.items : [];
  const discount = Number(body.discount ?? 0);
  if (!Number.isSafeInteger(discount) || discount < 0) return json({ ok: false, error: "Invalid discount amount" }, 400);
  if (!Number.isSafeInteger(no) || no < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !["کارت‌خوان", "نقدی", "کارت‌به‌کارت", "سایر"].includes(payment) ||
      items.length < 1 || items.length > 100) {
    return json({ ok: false, error: "Invalid invoice fields" }, 400);
  }

  let total = 0;
  let count = 0;
  const cleanItems = [];
  for (const item of items) {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const price = Number(item.price);
    const qty = Number(item.qty);
    if (!name || name.length > 120 || !Number.isSafeInteger(price) || price < 0 ||
        !Number.isSafeInteger(qty) || qty < 1 || qty > 10000) {
      return json({ ok: false, error: "Invalid invoice item" }, 400);
    }
    const lineTotal = price * qty;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) {
      return json({ ok: false, error: "Invoice amount is too large" }, 400);
    }
    total += lineTotal;
    count += qty;
    cleanItems.push({ name, price, qty, lineTotal });
  }

  if (discount > total) return json({ ok: false, error: "Discount cannot exceed subtotal" }, 400);

  try {
    await ensureDiscountColumn(env);
    const subtotal = total;
    total = subtotal - discount;
    const insert = await env.DB.prepare(
      "INSERT INTO invoices (invoice_number, invoice_date, payment_method, customer_name, total_amount, item_count, discount_amount) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(no, date, payment, customer || null, total, count, discount).run();
    const invoiceId = Number(insert.meta.last_row_id);
    const statements = cleanItems.map(item => env.DB.prepare(
      "INSERT INTO invoice_items (invoice_id, product_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?)"
    ).bind(invoiceId, item.name, item.price, item.qty, item.lineTotal));
    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true, id: invoiceId, no, total, discount, count }, 201);
  } catch (error) {
    if (String(error && error.message || "").includes("UNIQUE")) {
      return json({ ok: false, error: "Invoice number already exists" }, 409);
    }
    return json({ ok: false, error: "Could not save invoice" }, 500);
  }
}
