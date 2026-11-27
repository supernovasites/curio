ALTER TABLE availability_leads ADD COLUMN outcome TEXT;
ALTER TABLE availability_leads ADD COLUMN outcome_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE availability_leads ADD COLUMN outcome_at TEXT;
ALTER TABLE availability_leads ADD COLUMN outcome_by TEXT REFERENCES users(id);
