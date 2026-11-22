ALTER TABLE sessions ADD COLUMN oidc_sid text;
CREATE INDEX sessions_oidc_sid ON sessions(oidc_sid);
CREATE TABLE oidc_logout_replays (jti_hash text PRIMARY KEY, expires bigint NOT NULL);
