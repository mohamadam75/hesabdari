function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const validDate = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
    return json({ ok: false, error: "Invalid date range" }, 400);
  }

  try {
    const summary = await env.DB.prepare(
      "SELECT COUNT(*) AS invoice_count, COALESCE(SUM(total_amount), 0) AS revenue, COALESCE(SUM(item_count), 0) AS item_count FROM invoices WHERE (? = '' OR invoice_date >= ?) AND (? = '' OR invoice_date <= ?)"
    ).bind(from, from, to, to).first();

    const paymentResult = await env.DB.prepare(
      "SELECT payment_method AS method, COUNT(*) AS invoices, COALESCE(SUM(total_amount), 0) AS total FROM invoices WHERE (? = '' OR invoice_date >= ?) AND (? = '' OR invoice_date <= ?) GROUP BY payment_method ORDER BY total DESC"
    ).bind(from, from, to, to).all();

    const productResult = await env.DB.prepare(
      "SELECT ii.product_name AS name, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS total FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE (? = '' OR i.invoice_date >= ?) AND (? = '' OR i.invoice_date <= ?) GROUP BY ii.product_name ORDER BY total DESC LIMIT 10"
    ).bind(from, from, to, to).all();

    const categoryResult = await env.DB.prepare(
      "SELECT CASE WHEN p.category IN ('غذا', 'خوراک', 'پیش غذا') THEN 'food' ELSE 'other' END AS kind, COALESCE(SUM(ii.quantity), 0) AS quantity, COALESCE(SUM(ii.line_total), 0) AS total FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id LEFT JOIN products p ON p.name = ii.product_name WHERE (? = '' OR i.invoice_date >= ?) AND (? = '' OR i.invoice_date <= ?) GROUP BY kind"
    ).bind(from, from, to, to).all();

    const categories = { food: { quantity: 0, total: 0 }, other: { quantity: 0, total: 0 } };
    for (const row of (categoryResult.results || [])) {
      categories[row.kind] = { quantity: Number(row.quantity) || 0, total: Number(row.total) || 0 };
    }

    let audit = [];
    try { const a = await env.DB.prepare("SELECT id, invoice_number AS no, action, old_total AS oldTotal, new_total AS newTotal, changed_at AS changedAt, details FROM invoice_audit ORDER BY id DESC LIMIT 200").all(); audit = a.results || []; } catch {}
    let closures = [];
    try { const cl = await env.DB.prepare("SELECT id, closed_at AS closedAt, invoice_count AS invoiceCount, item_count AS itemCount, total_amount AS total, payments_json AS paymentsJson, detail_json AS detailJson FROM daily_closures ORDER BY id DESC LIMIT 30").all(); closures = (cl.results || []).map(x => ({...x, payments: JSON.parse(x.paymentsJson || "{}"), invoices: JSON.parse(x.detailJson || "[]")})); } catch {}
    return json({
      ok: true,
      from,
      to,
      summary: summary || { invoice_count: 0, revenue: 0, item_count: 0 },
      payments: paymentResult.results || [],
      topProducts: productResult.results || [],
      categories,
      audit,
      closures
    });
  } catch {
    return json({ ok: false, error: "Could not load reports" }, 500);
  }
}
