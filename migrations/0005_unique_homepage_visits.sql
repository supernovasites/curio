CREATE TABLE homepage_visits (day TEXT NOT NULL, visitor_hash TEXT NOT NULL, PRIMARY KEY(day,visitor_hash));
CREATE INDEX homepage_visits_visitor ON homepage_visits(visitor_hash,day);
