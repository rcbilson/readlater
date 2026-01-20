SHELL=/bin/bash
SERVICE=readlater

.PHONY: up
up: docker
	/n/config/compose up -d ${SERVICE}

.PHONY: docker
docker:
	docker build . -t rcbilson/${SERVICE}

.PHONY: backend
backend:
	cd backend/cmd/server && go run -tags fts5 .

.PHONY: frontend
frontend:
	cd frontend && npm run dev

.PHONY: upgrade-frontend
upgrade-frontend:
	cd frontend && npm update

.PHONY: upgrade-backend
upgrade-backend:
	cd backend && go get go@latest && go get -u ./... && go mod tidy

.PHONY: upgrade
upgrade: upgrade-frontend upgrade-backend
