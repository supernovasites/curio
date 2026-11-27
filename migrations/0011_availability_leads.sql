CREATE TABLE IF NOT EXISTS availability_leads (
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 city TEXT NOT NULL,
 stay_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'novo' CHECK(status IN ('novo','contatado')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 contacted_at TEXT,
 contacted_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS availability_leads_queue ON availability_leads(status,created_at DESC);
