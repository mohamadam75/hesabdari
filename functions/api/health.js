export async function onRequestGet({ env }) {
  if (!env.DB) {
    return Response.json(
      { ok: false, error: "D1 binding DB is missing" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = ? AND name IN (?, ?, ?) ORDER BY name"
    ).bind("table", "products", "invoices", "invoice_items").all();

    const tables = (result.results || []).map((row) => row.name);
    const required = ["products", "invoices", "invoice_items"];
    const missing = required.filter((name) => !tables.includes(name));

    return Response.json(
      {
        ok: missing.length === 0,
        database: "connected",
        tables,
        missing
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: "D1 query failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
