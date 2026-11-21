CREATE TABLE room_photos (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 5),
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
  payload TEXT,
  static_url TEXT,
  CHECK((payload IS NOT NULL) <> (static_url IS NOT NULL)),
  UNIQUE(room_id,slot)
);
CREATE INDEX room_photos_order ON room_photos(room_id,sequence);
INSERT INTO room_photos(id,room_id,slot,mime,static_url)
SELECT 'original-'||id,id,1,'image/jpeg','/assets/quartos/'||id||'.jpg'
FROM rooms WHERE photo<>'';
