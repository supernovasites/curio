UPDATE rooms
SET child_cents = CAST((adult_cents + 1) / 2 AS INTEGER)
WHERE child_cents IS NULL;
