SHELL=/bin/bash

docker:
	docker compose build
	docker compose up -d

.PHONY: frontend
frontend:
	cd frontend && yarnpkg run build && cd -

.PHONY: backend
backend:
	cd backend && GOBIN=${PWD}/bin go install knilson.org/recipe/cmd/server
