-- PANGO leaderboard — one row per runner, all time and per day.
-- Storing bests (not every run) keeps the board a single indexed
-- scan no matter how many people play.

CREATE TABLE IF NOT EXISTS best (
  uid   TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  city  TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  zone  TEXT,
  ts    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS best_score ON best (score DESC, ts ASC);

CREATE TABLE IF NOT EXISTS daily (
  day   TEXT NOT NULL,
  uid   TEXT NOT NULL,
  name  TEXT NOT NULL,
  city  TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  ts    INTEGER NOT NULL,
  PRIMARY KEY (day, uid)
);
CREATE INDEX IF NOT EXISTS daily_score ON daily (day, score DESC, ts ASC);
