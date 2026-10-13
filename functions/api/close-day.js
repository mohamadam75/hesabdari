function json(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
async function ensureTables(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS daily_closures (id INTEGER PRIMARY KEY AUTOINCREMENT, closed_at TEXT NOT NULL, invoice_count INTEGER NOT NULL, item_count INTEGER NOT NULL, total_amount INTEGER NOT NULL, payments_json TEXT NOT NULL, detail_json TEXT NOT NULL)").run();
  for (const sql of ["ALTER TABLE invoices ADD COLUMN display_number INTEGER","ALTER TABLE invoices ADD COLUMN shift_id INTEGER NOT NULL DEFAULT 0","ALTER TABLE invoices ADD COLUMN invoice_time TEXT"]) {
    try { await env.DB.prepare(sql).run(); } catch (e) { if (!String(e?.message||"").toLowerCase().includes("duplicate column")) throw e; }
  }
}
async function activeSnapshot(env) {
  const rows = await env.DB.prepare("SELECT id, COALESCE(display_number,invoice_number) AS no, invoice_date AS date, invoice_time AS time, payment_method AS payment, customer_name AS customer, total_amount AS total, discount_amount AS discount, item_count AS count FROM invoices WHERE COALESCE(shift_id,0)=0 ORDER BY id").all();
  const invoices = rows.results || [];
  for (const x of invoices) { const r=await env.DB.prepare("SELECT product_name AS name, unit_price AS price, quantity AS qty, line_total AS lineTotal FROM invoice_items WHERE invoice_id=? ORDER BY id").bind(x.id).all(); x.items=r.results||[]; }
  const payments={}; let itemCount=0,total=0;
  for (const x of invoices) { const k=x.payment||"نامشخص"; payments[k]=(payments[k]||0)+Number(x.total||0); itemCount+=Number(x.count||0); total+=Number(x.total||0); }
  return { invoices, payments, invoice_count:invoices.length, item_count:itemCount, total_amount:total };
}
export async function onRequestGet({env}) {
  try { await ensureTables(env); const snap=await activeSnapshot(env); const c=await env.DB.prepare("SELECT id,closed_at,invoice_count,item_count,total_amount,payments_json FROM daily_closures ORDER BY id DESC LIMIT 30").all(); return json({ok:true,active:snap,closures:(c.results||[]).map(x=>({...x,payments:JSON.parse(x.payments_json||"{}")}))}); }
  catch(e) { return json({ok:false,error:"Could not load shift status"},500); }
}
export async function onRequestPost({env,request}) {
  try {
    await ensureTables(env);
    const before=await activeSnapshot(env);
    const closedAt=new Date().toISOString();
    const ins=await env.DB.prepare("INSERT INTO daily_closures (closed_at,invoice_count,item_count,total_amount,payments_json,detail_json) VALUES (?,?,?,?,?,?)").bind(closedAt,before.invoice_count,before.item_count,before.total_amount,JSON.stringify(before.payments),JSON.stringify(before.invoices)).run();
    const id=Number(ins.meta.last_row_id);
    await env.DB.prepare("UPDATE invoices SET shift_id=? WHERE COALESCE(shift_id,0)=0").bind(id).run();
    return json({ok:true,closure:{id,closed_at:closedAt,invoice_count:before.invoice_count,item_count:before.item_count,total_amount:before.total_amount,payments:before.payments,invoices:before.invoices},active:{invoice_count:0,item_count:0,total_amount:0,payments:{},invoices:[]},message:"حساب بسته شد؛ سوابق حفظ شدند و شماره فاکتور بعدی از ۱ شروع می‌شود."},201);
  } catch(e) { return json({ok:false,error:"Could not close current shift"},500); }
}