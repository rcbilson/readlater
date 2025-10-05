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
        // version 2
        `
CREATE INDEX articles_lastAccess ON articles(lastAccess);
CREATE INDEX articles_created ON articles(created);
        `,
	// version 3
	`
ALTER TABLE articles ADD COLUMN lastModified datetime;

UPDATE articles SET lastModified = current_timestamp WHERE lastModified IS NULL;

CREATE TRIGGER articles_update_modified
AFTER UPDATE ON articles
BEGIN
  UPDATE articles SET lastModified = current_timestamp WHERE url = NEW.url;
END;

CREATE INDEX articles_lastModified ON articles(lastModified);
	`,
	// version 4
	`
CREATE TRIGGER articles_insert_modified
AFTER INSERT ON articles
BEGIN
  UPDATE articles SET lastModified = current_timestamp WHERE url = NEW.url;
END;
	`,
	// version 5
	`
-- Remove the problematic trigger from version 4
DROP TRIGGER IF EXISTS articles_insert_modified;

-- Update existing rows to have lastModified if they don't already
UPDATE articles SET lastModified = COALESCE(lastModified, created) WHERE lastModified IS NULL;

-- Set default value for lastModified on new inserts
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- First, create a temporary table with the new schema
CREATE TABLE articles_new (
  url text primary key,
  contents text,
  title text,
  unread boolean default true,
  archived boolean default false,
  created datetime default current_timestamp,
  lastAccess datetime default current_timestamp,
  lastModified datetime default current_timestamp
);

-- Copy data from old table
INSERT INTO articles_new (url, contents, title, unread, archived, created, lastAccess, lastModified)
SELECT url, contents, title, unread, archived, created, lastAccess, COALESCE(lastModified, created) 
FROM articles;

-- Drop the old table and rename the new one
DROP TABLE articles;
ALTER TABLE articles_new RENAME TO articles;

-- Recreate all the triggers
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

CREATE TRIGGER articles_update_modified
AFTER UPDATE ON articles
BEGIN
  UPDATE articles SET lastModified = current_timestamp WHERE url = NEW.url;
END;

-- Recreate indexes
CREATE INDEX articles_lastAccess ON articles(lastAccess);
CREATE INDEX articles_created ON articles(created);
CREATE INDEX articles_lastModified ON articles(lastModified);
	`,
}
