# ---- Build backend ----
FROM python:3.12-slim AS backend-builder

WORKDIR /app
COPY backend/ ./backend/

RUN pip install uv && \
    cd backend && \
    uv pip install --system --no-cache -r pyproject.toml 2>/dev/null || \
    uv pip install --system --no-cache .

# ---- Runtime ----
FROM python:3.12-slim AS runtime

WORKDIR /app
COPY --from=backend-builder /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=backend-builder /usr/local/bin /usr/local/bin
COPY backend/src /app/src

ENV PYTHONPATH=/app/src
EXPOSE 8000

CMD ["uvicorn", "agentco.main:app", "--host", "0.0.0.0", "--port", "8000"]
