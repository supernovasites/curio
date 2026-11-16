CREATE TABLE homepage_metrics (day TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('visita','reserva_online','whatsapp')), count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,kind));
