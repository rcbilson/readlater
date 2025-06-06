package main

var schema = []string{
	// version 1
	`
CREATE TABLE metadata (
  id integer primary key,
  schemaVersion integer
);

CREATE TABLE articles (
  url text primary key,
  contents text,
  title text,
  unread boolean default true,
  archived boolean default false,
  created datetime default current_timestamp,
  lastAccess datetime default current_timestamp
);

CREATE TABLE usage (
  timestamp datetime default current_timestamp,
  url text,
  lengthIn integer,
  lengthOut integer,
  tokensIn integer,
  tokensOut integer
);

CREATE VIRTUAL TABLE fts USING fts5(
  url UNINDEXED,
  title,
  contents,
  content='articles',
  prefix='1 2 3',
  tokenize='porter unicode61'
);

-- Triggers to keep the FTS index up to date.
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO fts(rowid, url, title, contents) VALUES (new.rowid, new.url, new.title, new.contents);
END;

CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO fts(fts, rowid, url, title, contents) VALUES('delete', old.rowid, old.url, old.title, old.contents);
END;

CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO fts(fts, rowid, url, title, contents) VALUES('delete', old.rowid, old.url, old.title, old.contents);
  INSERT INTO fts(rowid, url, title, contents) VALUES (new.rowid, new.url, new.title, new.contents);
END;
	`,
}
