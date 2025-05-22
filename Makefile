SHELL=/bin/bash
SERVICE=recipe

.PHONY: up
up: docker
	/n/config/compose up -d ${SERVICE}

.PHONY: docker
docker:
	docker build . -t rcbilson/${SERVICE}

.PHONY: backend
backend:
	. ./aws && cd backend/cmd/server && go run -tags fts5 .

.PHONY: frontend
frontend:
	cd frontend && yarn dev

.PHONY: upgrade-frontend
upgrade-frontend:
	cd frontend && yarn upgrade --latest

.PHONY: upgrade-backend
upgrade-backend:
	cd backend && go get go@latest && go get -u ./... && go mod tidy

.PHONY: upgrade
upgrade: upgrade-frontend upgrade-backend
