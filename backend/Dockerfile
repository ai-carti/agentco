FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies
RUN uv sync --no-dev --frozen

# Copy source
COPY . .

# Set PYTHONPATH
ENV PYTHONPATH=src

# Default port
ENV PORT=8000

EXPOSE $PORT

CMD PYTHONPATH=src .venv/bin/python -c "\
from agentco.orm.base import Base; \
from agentco.orm.user import UserORM; \
from agentco.orm.company import CompanyORM; \
from agentco.orm.agent import AgentORM; \
from agentco.orm.agent_library import AgentLibraryORM; \
from agentco.orm.task import TaskORM; \
from agentco.orm.run import RunORM, RunEventORM; \
from agentco.orm.credential import CredentialORM; \
from agentco.orm.mcp_server import McpServerORM; \
from agentco.db.session import engine; \
Base.metadata.create_all(bind=engine); \
print('Tables OK')" && \
PYTHONPATH=src .venv/bin/uvicorn agentco.main:app --host 0.0.0.0 --port $PORT
