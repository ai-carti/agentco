"""
logging_config.py — Structured logging setup using structlog.

ALEX-POST-004: replace plain logging with structlog for structured output.
"""
from __future__ import annotations

import logging
import structlog


def setup_logging(level: str = "INFO") -> None:
    """Configure structlog for structured JSON logging."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    # Also configure stdlib logging to route through structlog
    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, level, logging.INFO),
    )
