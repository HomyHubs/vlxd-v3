.PHONY: bootstrap dev check migrate contracts

bootstrap:
	corepack enable
	pnpm install
	docker compose -f compose.dev.yml up --build -d

dev:
	docker compose -f compose.dev.yml up --build

check:
	pnpm check

migrate:
	docker compose -f compose.dev.yml run --rm migrate

contracts:
	pnpm contracts:lint
	pnpm contracts:generate
	pnpm contracts:check
