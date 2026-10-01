export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS teams (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  name_key      text NOT NULL UNIQUE,
  emoji         text NOT NULL DEFAULT '🍂',
  color         text NOT NULL DEFAULT 'pumpkin',
  motto         text,
  invite_code   text NOT NULL UNIQUE,
  captain_id    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                text PRIMARY KEY,
  email             text,
  provider_name     text,
  provider_image    text,
  display_name      text,
  name_mode         text NOT NULL DEFAULT 'real',
  avatar            text NOT NULL DEFAULT '🚶',
  country           text,
  timezone          text NOT NULL DEFAULT 'UTC',
  team_id           text REFERENCES teams(id) ON DELETE SET NULL,
  ingest_token_hash text UNIQUE,
  onboarded         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_team_idx ON users(team_id);

CREATE TABLE IF NOT EXISTS accounts (
  provider            text NOT NULL,
  provider_account_id text NOT NULL,
  user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(user_id);

CREATE TABLE IF NOT EXISTS step_entries (
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  source     text NOT NULL,
  steps      integer NOT NULL CHECK (steps >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, source)
);
CREATE INDEX IF NOT EXISTS step_entries_day_idx ON step_entries(day);

CREATE TABLE IF NOT EXISTS activities (
  id         bigserial PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  intensity  text NOT NULL CHECK (intensity IN ('light','moderate','heavy')),
  minutes    integer NOT NULL CHECK (minutes > 0),
  label      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_user_day_idx ON activities(user_id, day);
CREATE INDEX IF NOT EXISTS activities_day_idx ON activities(day);

CREATE TABLE IF NOT EXISTS connections (
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  external_user_id text,
  access_token     text,
  refresh_token    text,
  expires_at       timestamptz,
  last_sync_at     timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
CREATE INDEX IF NOT EXISTS connections_external_idx ON connections(provider, external_user_id);
`;
