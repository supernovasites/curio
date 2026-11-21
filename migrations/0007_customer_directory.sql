CREATE TABLE reservation_entries (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL REFERENCES reservation_dates(day),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','confirmed','rejected','cancelled')),
  payment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT REFERENCES users(id)
);
INSERT INTO reservation_entries SELECT * FROM reservations;
DROP TABLE reservations;
ALTER TABLE reservation_entries RENAME TO reservations;
CREATE UNIQUE INDEX reservations_one_booking_per_day ON reservations(day) WHERE status IN ('approved','confirmed');
CREATE UNIQUE INDEX reservations_one_active_request ON reservations(day,contact_id) WHERE status IN ('pending','approved','confirmed');
CREATE INDEX reservations_customer ON reservations(contact_id,day);
