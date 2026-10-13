function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
async function ensureColumns(env) {
  const changes = [
    "ALTER TABLE invoices ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0)",
    "ALTER TABLE invoices ADD COLUMN display_number INTEGER",
    "ALTER TABLE invoices ADD COLUMN shift_id INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE invoices ADD COLUMN invoice_time TEXT"
  ];
  for (const sql of changes) {
    try { await env.DB.prepare(sql).run(); }
    catch (error) { if (!String(error?.message || "").toLowerCase().includes("duplicate column")) throw error; }
  }
}
export async function onRequestGet({ env }) {
  try {
    await ensureColumns(env);
    const result = await env.DB.prepare(
      "SELECT id, COALESCE(display_number, invoice_number) AS no, invoice_number AS internalNo, invoice_date AS date, COALESCE(invoice_time, substr(datetime('now','localtime'),12,5)) AS time, payment_method AS payment, customer_name AS customer, total_amount AS total, discount_amount AS discount, item_count AS count, COALESCE(shift_id,0) AS shift_id FROM invoices ORDER BY id DESC LIMIT 2000"
    ).all();
    const invoices = result.results || [];
    for (const invoice of invoices) {
      const items = await env.DB.prepare("SELECT product_name AS name, unit_price AS price, quantity AS qty, line_total AS lineTotal FROM invoice_items WHERE invoice_id = ? ORDER BY id").bind(invoice.id).all();
      invoice.items = items.results || [];
    }
    return json({ ok: true, invoices });
  } catch (error) {
    return json({ ok: false, error: "Could not load invoices" }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const no = Number(body.no);
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ? body.time : new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false });
  const payment = typeof body.payment === "string" ? body.payment : "";
  const customer = typeof body.customer === "string" ? body.customer.trim().slice(0, 120) : "";
  const items = Array.isArray(body.items) ? body.items : [];
  const discount = Number(body.discount ?? 0);
  if (!Number.isSafeInteger(discount) || discount < 0) return json({ ok: false, error: "Invalid discount amount" }, 400);
  if (!Number.isSafeInteger(no) || no < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !["کارت‌خوان", "نقدی", "کارت‌به‌کارت", "سایر"].includes(payment) || items.length < 1 || items.length > 100) return json({ ok: false, error: "Invalid invoice fields" }, 400);
  let subtotal = 0, count = 0; const cleanItems = [];
  for (const item of items) {
    const name = typeof item.name === "string" ? item.name.trim() : "", price = Number(item.price), qty = Number(item.qty);
    if (!name || name.length > 120 || !Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(qty) || qty < 1 || qty > 10000) return json({ ok: false, error: "Invalid invoice item" }, 400);
    const lineTotal = price * qty;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal + lineTotal)) return json({ ok: false, error: "Invoice amount is too large" }, 400);
    subtotal += lineTotal; count += qty; cleanItems.push({ name, price, qty, lineTotal });
  }
  if (discount > subtotal) return json({ ok: false, error: "Discount cannot exceed subtotal" }, 400);
  try {
    await ensureColumns(env);
    const total = subtotal - discount;
    const seq = await env.DB.prepare("SELECT COALESCE(MAX(invoice_number),0)+1 AS next FROM invoices").first();
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM invoices WHERE COALESCE(shift_id,0)=0").first();
    const displayNo = Number(active?.n || 0) + 1;
    const internalNo = Number(seq?.next || 1);
    const insert = await env.DB.prepare("INSERT INTO invoices (invoice_number, display_number, shift_id, invoice_date, invoice_time, payment_method, customer_name, total_amount, item_count, discount_amount) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)").bind(internalNo, displayNo, date, time, payment, customer || null, total, count, discount).run();
    const invoiceId = Number(insert.meta.last_row_id);
    const statements = cleanItems.map(item => env.DB.prepare("INSERT INTO invoice_items (invoice_id, product_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?)").bind(invoiceId, item.name, item.price, item.qty, item.lineTotal));
    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true, id: invoiceId, no: displayNo, internalNo, shift_id: 0, date, time, total, discount, count }, 201);
  } catch (error) {
    return json({ ok: false, error: "Could not save invoice" }, 500);
  }
}