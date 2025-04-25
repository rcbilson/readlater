SHELL=/bin/bash
SERVICE=recipe

.PHONY: up
up: docker
	/n/config/compose up -d ${SERVICE}

.PHONY: docker
docker:
	docker build . -t rcbilson/${SERVICE}

.PHONY: server
server:
	. ./aws && cd backend/cmd/server && go run -tags fts5 .

.PHONY: dev
dev:
	tmux new-window -c frontend -bt1 yarn dev
	tmux split-window -c backend/cmd/server go run -tags fts5 .

.PHONY: upgrade-frontend
upgrade-frontend:
	cd frontend && yarn upgrade --latest

.PHONY: upgrade-backend
upgrade-backend:
	cd backend && go get go@latest && go get -u ./...

.PHONY: upgrade
upgrade: upgrade-frontend upgrade-backend
