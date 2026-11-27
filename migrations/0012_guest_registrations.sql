CREATE TABLE IF NOT EXISTS guest_registrations (
 id TEXT PRIMARY KEY,
 request_key TEXT UNIQUE,
 contact_id TEXT UNIQUE REFERENCES contacts(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 entry_date TEXT NOT NULL,
 exit_date TEXT NOT NULL,
 name TEXT NOT NULL,
 birth_date TEXT NOT NULL,
 cpf TEXT NOT NULL,
 rg TEXT NOT NULL,
 occupation TEXT NOT NULL,
 companions TEXT NOT NULL DEFAULT '[]',
 dietary_restrictions TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS guest_registrations_active_cpf ON guest_registrations(cpf) WHERE status<>'rejected';
CREATE INDEX IF NOT EXISTS guest_registrations_status ON guest_registrations(status,created_at DESC);
