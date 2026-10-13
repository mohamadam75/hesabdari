-- Expand supported product categories while preserving existing product rows.
PRAGMA foreign_keys = OFF;
CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  category TEXT NOT NULL CHECK (category IN ('غذا', 'خوراک', 'پیش غذا', 'نوشیدنی', 'اضافه‌ها')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO products_new (id, name, price, category, created_at)
SELECT id, name, price, category, created_at FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;
PRAGMA foreign_keys = ON;
