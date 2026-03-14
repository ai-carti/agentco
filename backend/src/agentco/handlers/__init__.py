from .companies import router as companies_router
from .agents import router as agents_router
from .tasks import router as tasks_router
from .auth import router as auth_router

__all__ = ["companies_router", "agents_router", "tasks_router", "auth_router"]
