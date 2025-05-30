package main

var schema = []string{
	// version 1
	`
CREATE TABLE metadata (
  id integer primary key,
  schemaVersion integer
);

CREATE TABLE IF NOT EXISTS recipes (
  url text primary key,
  summary text,
  lastAccess datetime,
  hitCount integer
);

CREATE TABLE IF NOT EXISTS usage (
  timestamp datetime default current_timestamp,
  url text,
  lengthIn integer,
  lengthOut integer,
  tokensIn integer,
  tokensOut integer
);

DROP TABLE IF EXISTS fts;

CREATE VIRTUAL TABLE fts USING fts5(
  url UNINDEXED,
  summary,
  content='recipes',
  prefix='1 2 3',
  tokenize='porter unicode61'
);

-- Triggers to keep the FTS index up to date.
DROP TRIGGER IF EXISTS recipes_ai;
CREATE TRIGGER recipes_ai AFTER INSERT ON recipes BEGIN
  INSERT INTO fts(rowid, url, summary) VALUES (new.rowid, new.url, new.summary);
END;

DROP TRIGGER IF EXISTS recipes_ad;
CREATE TRIGGER recipes_ad AFTER DELETE ON recipes BEGIN
  INSERT INTO fts(fts, rowid, url, summary) VALUES('delete', old.rowid, old.url, old.summary);
END;

DROP TRIGGER IF EXISTS recipes_au;
CREATE TRIGGER recipes_au AFTER UPDATE ON recipes BEGIN
  INSERT INTO fts(fts, rowid, url, summary) VALUES('delete', old.rowid, old.url, old.summary);
  INSERT INTO fts(rowid, url, summary) VALUES (new.rowid, new.url, new.summary);
END;

INSERT INTO fts(fts) VALUES('rebuild');
	`,
	// version 2
	`
CREATE TABLE session (
  email text,
  nonce text
);
	`,
	// version 3
	`
CREATE TABLE new_session (
  email text UNIQUE,
  nonce text
);
INSERT INTO new_session SELECT * FROM session;
DROP TABLE session;
ALTER TABLE new_session RENAME TO session;
	`,
}
