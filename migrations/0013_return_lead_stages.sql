ALTER TABLE availability_leads ADD COLUMN stage TEXT NOT NULL DEFAULT 'principal' CHECK(stage IN ('principal','pendentes','interessados','sem_interesse','sem_resposta','reservas'));
ALTER TABLE availability_leads ADD COLUMN notes TEXT NOT NULL DEFAULT '';
UPDATE availability_leads SET stage=CASE WHEN status='contatado' THEN 'pendentes' ELSE 'principal' END;
CREATE INDEX IF NOT EXISTS availability_leads_stage_queue ON availability_leads(stage,created_at DESC);
