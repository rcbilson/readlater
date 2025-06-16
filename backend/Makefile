GOFLAGS=--tags=fts5

check:
	go test ${GOFLAGS} -short ./...

check-full:
	go mod tidy
	ctags -R --exclude='*.md' --exclude='*.html'
	go vet ./...
	. ../aws && go test ${GOFLAGS} ./...
