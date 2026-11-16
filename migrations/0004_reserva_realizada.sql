CREATE TABLE interactions_v2 (campaign_id TEXT NOT NULL REFERENCES campaigns(id), contact_id TEXT NOT NULL REFERENCES contacts(id), status TEXT NOT NULL DEFAULT 'nao_contatado' CHECK(status IN ('nao_contatado','aguardando','interessado','sem_interesse','sem_resposta','reserva_realizada')), sent_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by TEXT REFERENCES users(id), notes TEXT NOT NULL DEFAULT '', PRIMARY KEY(campaign_id,contact_id));
INSERT INTO interactions_v2(rowid,campaign_id,contact_id,status,sent_at,updated_at,updated_by,notes) SELECT rowid,campaign_id,contact_id,status,sent_at,updated_at,updated_by,notes FROM interactions;
DROP TABLE interactions;
ALTER TABLE interactions_v2 RENAME TO interactions;
