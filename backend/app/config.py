from pydantic_settings import BaseSettings
from pydantic import model_validator
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "TJSR Backend"
    debug: bool = True

    # PostgreSQL / Supabase
    database_url: str = "postgresql+asyncpg://postgres:iniqcuiqciunci@db.ppvpsmhjvljjulsgfagd.supabase.co:5432/postgres?ssl=require"
    sync_database_url: str = ""

    @model_validator(mode="after")
    def _derive_sync_url(self) -> "Settings":
        if not self.sync_database_url:
            # Strip +asyncpg driver prefix so psycopg2 can use the same host/db.
            # Also normalise ?ssl=require → ?sslmode=require (psycopg2 syntax).
            url = self.database_url.replace("+asyncpg", "")
            url = url.replace("?ssl=require", "?sslmode=require")
            url = url.replace("&ssl=require", "&sslmode=require")
            self.sync_database_url = url
        return self

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "tjsr_secret"

    # Qdrant
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_api_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Featherless
    featherless_api_url: str = "https://api.featherless.ai/v1"
    featherless_api_key: str = ""
    featherless_model: str = "Qwen/Qwen3-8B"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Embedding
    embedding_model: str = "all-MiniLM-L6-v2"

    # Firebase
    firebase_service_account_key: str = "firebase-service-account.json"
    firebase_project_id: str = "tjsr-3b6df"
    firebase_storage_bucket: str = "tjsr-3b6df.appspot.com"

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Backend
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
