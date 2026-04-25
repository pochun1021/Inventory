from __future__ import annotations

import os
from functools import lru_cache

from supabase import Client, create_client


class SupabaseConfigError(RuntimeError):
    """Raised when required Supabase config is missing."""


def _get_env(name: str) -> str:
    return os.getenv(name, "").strip()


def get_supabase_schema() -> str:
    return _get_env("SUPABASE_SCHEMA") or "public"


def is_supabase_enabled() -> bool:
    return (_get_env("USE_SUPABASE").lower() in {"1", "true", "yes"}) and bool(_get_env("SUPABASE_URL"))


def validate_supabase_config() -> None:
    if not _get_env("SUPABASE_URL"):
        raise SupabaseConfigError("SUPABASE_URL is required")
    if not _get_env("SUPABASE_SERVICE_ROLE_KEY"):
        raise SupabaseConfigError("SUPABASE_SERVICE_ROLE_KEY is required")


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    validate_supabase_config()
    return create_client(_get_env("SUPABASE_URL"), _get_env("SUPABASE_SERVICE_ROLE_KEY"))
