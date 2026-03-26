"""
logging_config.py — Structured logging setup using structlog.

ALEX-POST-004: replace plain logging with structlog for structured output.

ALEX-TD-254 (known limitation):
  The codebase uses two parallel logging systems:
  1. structlog — configured here with JSON processors (via structlog.get_logger())
  2. stdlib logging — used throughout handlers/services via logging.getLogger(__name__)

  Full integration would require:
    - structlog.stdlib.ProcessorFormatter for stdlib handlers
    - stdlib's root logger StreamHandler using that formatter
    - Switching logger_factory to structlog.stdlib.LoggerFactory()

  This full routing is non-trivial and risky to apply while the codebase uses both
  logging systems in production. It is documented here as a known limitation.

  Current workaround: both stdlib and structlog output goes to stdout, stdlib
  in plain text (basicConfig format="%(message)s") and structlog in JSON.
  Railway Logs and Datadog can distinguish by checking if the line is valid JSON.

  To fix fully: replace PrintLoggerFactory with stdlib.LoggerFactory() and add
  ProcessorFormatter — tracked as a future improvement.
"""
from __future__ import annotations

import logging
import structlog


def setup_logging(level: str = "INFO") -> None:
    """Configure structlog for structured JSON logging.

    Also configures stdlib logging with basicConfig as a parallel system.

    ALEX-TD-232 fix: removed `add_logger_name` from processors.
    `structlog.stdlib.add_logger_name` requires a `logging.Logger` object with a
    `.name` attribute, but `PrintLoggerFactory` creates `PrintLogger` (no `.name`).
    This caused `AttributeError: 'PrintLogger' object has no attribute 'name'` on
    every structlog call — crashing all JSON logging in production silently.
    Logger name context is not critical for structured JSON (level + timestamp
    + message are sufficient for filtering); removed to fix the crash.

    ALEX-TD-254: stdlib logging routing via StreamHandler — known limitation.
    stdlib loggers (logging.getLogger) are configured separately via basicConfig.
    They are NOT routed through structlog processors. This means stdlib log lines
    appear as plain text rather than JSON. Full integration deferred (see module docstring).
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
    # ALEX-TD-254: stdlib logging configured separately (not routed through structlog).
    # See module docstring for known limitation explanation.
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        level=getattr(logging, level, logging.INFO),
    )
