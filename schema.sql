-- Akbar Jooje accounting database schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  category TEXT NOT NULL CHECK (category IN ('غذا', 'نوشیدنی', 'اضافه‌ها')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number INTEGER NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  customer_name TEXT,
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total INTEGER NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
