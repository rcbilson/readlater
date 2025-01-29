SHELL=/bin/bash
SERVICE=recipe

.PHONY: up
up: docker
	/n/config/compose up -d ${SERVICE}

.PHONY: docker
docker:
	docker build . -t rcbilson/${SERVICE}

.PHONY: dev
dev:
	tmux new-window -c frontend -bt1 yarn dev
	tmux split-window -c backend/cmd/server go run .
