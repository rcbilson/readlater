package main

var schema = []string{
	// version 1
	`
CREATE TABLE metadata (
  id integer primary key,
  schemaVersion integer
);

CREATE TABLE IF NOT EXISTS articles (
  url text primary key,
  contents text,
  archived boolean default false,
  created datetime default current_timestamp,
  lastAccess datetime default current_timestamp
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
  contents,
  content='articles',
  prefix='1 2 3',
  tokenize='porter unicode61'
);

-- Triggers to keep the FTS index up to date.
DROP TRIGGER IF EXISTS articles_ai;
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO fts(rowid, url, contents) VALUES (new.rowid, new.url, new.contents);
END;

DROP TRIGGER IF EXISTS articles_ad;
CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO fts(fts, rowid, url, contents) VALUES('delete', old.rowid, old.url, old.contents);
END;

DROP TRIGGER IF EXISTS articles_au;
CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO fts(fts, rowid, url, contents) VALUES('delete', old.rowid, old.url, old.contents);
  INSERT INTO fts(rowid, url, contents) VALUES (new.rowid, new.url, new.contents);
END;

INSERT INTO fts(fts) VALUES('rebuild');
	`,
}
