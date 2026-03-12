# ---- Builder ----
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy dependency files first for layer caching
COPY backend/pyproject.toml backend/uv.lock* ./backend/

# Install dependencies into a venv using uv sync
RUN cd backend && uv venv .venv && uv sync --frozen --no-dev 2>/dev/null || uv sync --no-dev

# ---- Runtime ----
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy the venv from builder
COPY --from=builder /app/backend/.venv /app/.venv

# Copy source code
COPY backend/src /app/src

ENV PYTHONPATH=/app/src
ENV PATH="/app/.venv/bin:$PATH"
ENV VIRTUAL_ENV=/app/.venv

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "agentco.main:app", "--host", "0.0.0.0", "--port", "8000"]
