"""Fernet-based encryption for API keys.

Key is read from env var ENCRYPTION_KEY (base64url Fernet key).
If not set, a test key is generated (dev only — not persistent!).
"""
import os
import base64
import logging
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

# ALEX-TD-053: cache the Fernet instance — no need to reconstruct on every call.
# _fernet_cache holds (key_str, Fernet) so we rebuild only if the key changes.
_fernet_cache: tuple[str, Fernet] | None = None


def _get_fernet() -> Fernet:
    global _fernet_cache
    key = os.environ.get("ENCRYPTION_KEY")
    if not key:
        # ALEX-TD-237: raise hard error in production so operator can't accidentally
        # deploy with the zero-byte fallback key (which anyone can use to decrypt).
        # AGENTCO_ENV=production (or RAILWAY_ENVIRONMENT set) → fail fast at startup.
        _env = os.environ.get("AGENTCO_ENV", "") or os.environ.get("RAILWAY_ENVIRONMENT", "")
        if _env.lower() in ("production", "prod", "staging"):
            raise RuntimeError(
                "ENCRYPTION_KEY env var is required in production but is not set. "
                "Generate a key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
                "and set it as ENCRYPTION_KEY in your deployment environment."
            )
        # Dev fallback: deterministic key from zero bytes (NOT for prod)
        # ALEX-TD-022 fix: warn loudly when ENCRYPTION_KEY is not set.
        logger.warning(
            "ENCRYPTION_KEY is not set — using insecure dev key (b'\\x00'*32). "
            "Set ENCRYPTION_KEY env variable in production!"
        )
        key = base64.urlsafe_b64encode(b"\x00" * 32).decode()
    # Return cached instance unless key has changed (e.g. in tests)
    if _fernet_cache is not None and _fernet_cache[0] == key:
        return _fernet_cache[1]
    fernet = Fernet(key.encode() if isinstance(key, str) else key)
    _fernet_cache = (key, fernet)
    return fernet


def encrypt(plaintext: str) -> str:
    """Encrypt a string and return base64 token."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a Fernet token and return plaintext."""
    f = _get_fernet()
    return f.decrypt(token.encode()).decode()
