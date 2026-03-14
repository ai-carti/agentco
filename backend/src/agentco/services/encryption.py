"""Fernet-based encryption for API keys.

Key is read from env var ENCRYPTION_KEY (base64url Fernet key).
If not set, a test key is generated (dev only — not persistent!).
"""
import os
import base64
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY")
    if not key:
        # Dev fallback: deterministic key from zero bytes (NOT for prod)
        # In production ENCRYPTION_KEY must be set
        key = base64.urlsafe_b64encode(b"\x00" * 32).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    """Encrypt a string and return base64 token."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a Fernet token and return plaintext."""
    f = _get_fernet()
    return f.decrypt(token.encode()).decode()
