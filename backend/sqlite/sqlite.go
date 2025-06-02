package sqlite

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

func NewFromFile(dbfile string, schema []string) (*sql.DB, error) {
	return new(dbfile, schema)
}

func NewFromMemory(schema []string) (*sql.DB, error) {
	return new(":memory:", schema)
}

func new(dbfile string, schema []string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", dbfile)
	if err != nil {
		return nil, err
	}

	err = applySchema(db, schema)
	if err != nil {
		return nil, err
	}

	return db, nil
}

func applySchema(db *sql.DB, schema []string) error {
	schemaVersion := 0
	row := db.QueryRow("SELECT schemaVersion FROM metadata WHERE id = 0")
	_ = row.Scan(&schemaVersion)

	for _, sql := range schema[schemaVersion:] {
		_, err := db.Exec(sql)
		if err != nil {
			return fmt.Errorf("schema migration failed: %w", err)
		}
	}
	_, err := db.Exec(`INSERT INTO metadata (id, schemaVersion) VALUES (0, @version)
						ON CONFLICT DO UPDATE SET schemaVersion = @version`,
		sql.Named("version", len(schema)))
	if err != nil {
		return fmt.Errorf("failed to update schema version: %w", err)
	}
	return nil
}
