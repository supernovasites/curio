CREATE TABLE customer_accounts (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(id),
  cpf TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE customer_sessions (
  token_hash TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES customer_accounts(contact_id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX customer_sessions_expiry ON customer_sessions(expires_at);

CREATE TABLE reservation_dates (
  day TEXT PRIMARY KEY,
  open INTEGER NOT NULL CHECK (open IN (0, 1))
);

CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL REFERENCES reservation_dates(day),
  contact_id TEXT NOT NULL REFERENCES customer_accounts(contact_id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','confirmed','rejected','cancelled')),
  payment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT REFERENCES users(id)
);
CREATE UNIQUE INDEX reservations_one_booking_per_day ON reservations(day)
  WHERE status IN ('approved','confirmed');
CREATE UNIQUE INDEX reservations_one_active_request ON reservations(day,contact_id)
  WHERE status IN ('pending','approved','confirmed');
CREATE INDEX reservations_customer ON reservations(contact_id, day);
