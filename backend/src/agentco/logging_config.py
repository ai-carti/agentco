"""
logging_config.py — Structured logging setup using structlog.

ALEX-POST-004: replace plain logging with structlog for structured output.
"""
from __future__ import annotations

import logging
import structlog


def setup_logging(level: str = "INFO") -> None:
    """Configure structlog for structured JSON logging.

    ALEX-TD-232 fix: removed `add_logger_name` from processors.
    `structlog.stdlib.add_logger_name` requires a `logging.Logger` object with a
    `.name` attribute, but `PrintLoggerFactory` creates `PrintLogger` (no `.name`).
    This caused `AttributeError: 'PrintLogger' object has no attribute 'name'` on
    every structlog call — crashing all JSON logging in production silently.
    Logger name context is not critical for structured JSON (level + timestamp
    + message are sufficient for filtering); removed to fix the crash.
    """
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            # ALEX-TD-232: add_logger_name removed — incompatible with PrintLoggerFactory
            # (PrintLogger has no .name attr). Use stdlib logging name via basicConfig instead.
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
