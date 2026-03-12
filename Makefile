.PHONY: dev test build lint clean

# ── Dev servers ──────────────────────────────────────────
dev:
	@echo "Starting backend + frontend dev servers..."
	@$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	cd backend && uv run uvicorn agentco.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# ── Tests ─────────────────────────────────────────────────
test: test-backend test-frontend

test-backend:
	@echo "=== Backend tests ==="
	cd backend && uv run pytest -v

test-frontend:
	@echo "=== Frontend tests ==="
	cd frontend && npm test

test-infra:
	@echo "=== Infra / structure tests ==="
	.venv/bin/pytest tests_infra/ -v

# ── Build ─────────────────────────────────────────────────
build: build-backend build-frontend

build-backend:
	cd backend && uv build

build-frontend:
	cd frontend && npm run build

# ── Misc ──────────────────────────────────────────────────
lint:
	cd backend && uv run ruff check src/ tests/
	cd frontend && npx tsc --noEmit

clean:
	rm -rf backend/.venv backend/dist backend/__pycache__
	rm -rf frontend/node_modules frontend/dist
	rm -rf .venv .pytest_cache
