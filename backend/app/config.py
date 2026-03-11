from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "backend" / ".env")


class Settings:
    app_name = "MuscleMap API"
    app_version = "0.1.0"
    root_dir = ROOT_DIR
    data_dir = root_dir / "backend" / "app" / "data"
    mesh_mapping_path = data_dir / "mesh_mapping.json"
    cache_db_path = root_dir / "backend" / ".cache" / "musclemap.sqlite3"
    mock_mode = os.getenv("MUSCLEMAP_MOCK_MODE", "true").lower() != "false"
    llm_provider = os.getenv("LLM_PROVIDER", os.getenv("OPENAI_PROVIDER", "openai"))
    llm_api_key = os.getenv("LLM_API_KEY", os.getenv("OPENAI_API_KEY", ""))
    llm_base_url = os.getenv(
        "LLM_BASE_URL", os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    )
    llm_model = os.getenv("LLM_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    llm_timeout_seconds = float(os.getenv("LLM_TIMEOUT_SECONDS", "180"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
