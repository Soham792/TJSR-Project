from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.services.firebase_auth import init_firebase
from app.api.v1.router import api_router
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(f"Starting {settings.app_name}")

    # Initialize Firebase
    init_firebase()

    # ── Non-blocking Background Startup Tasks ──────────────────────────
    async def run_startup_tasks():
        # 1. Create any missing tables
        try:
            from app.models.database import engine
            from app.models import Base
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables verified/created")
        except Exception as e:
            logger.warning(f"create_all skipped or failed: {e}")

        # 2. Apply additive column migrations and indexes
        try:
            from app.models.database import engine
            from sqlalchemy import text
            async with engine.begin() as conn:
                # Enable pg_trgm for fast search
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

                for _sql in [
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_skills JSONB",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR",
                    "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS match_score   INTEGER DEFAULT 0",
                    "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS raw_content   TEXT",
                    "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS embedding_id  VARCHAR",
                    "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS neo4j_node_id VARCHAR",
                    "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS date_posted   TIMESTAMPTZ",
                    # Fast search indexes
                    "CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON jobs USING gin (title gin_trgm_ops)",
                    "CREATE INDEX IF NOT EXISTS idx_jobs_company_trgm ON jobs USING gin (company gin_trgm_ops)",
                    "CREATE INDEX IF NOT EXISTS idx_jobs_location_trgm ON jobs USING gin (location gin_trgm_ops)",
                    "CREATE INDEX IF NOT EXISTS idx_jobs_skills_gin ON jobs USING gin (skills)",
                ]:
                    try:
                        # Use a shorter statement timeout for migrations to prevent permanent hangs
                        await conn.execute(text("SET statement_timeout = '20s'"))
                        await conn.execute(text(_sql))
                    except Exception as col_err:
                        logger.warning(f"Migration step skipped: {col_err}")
            logger.info("Database schema and indexes verified")
        except Exception as e:
            logger.warning(f"Schema optimization block failed: {e}")

        # 3. Ensure Qdrant collections exist
        try:
            from app.services.rag.indexer import ensure_collections
            import asyncio
            await asyncio.get_event_loop().run_in_executor(None, ensure_collections)
            logger.info("Qdrant collections verified")
        except Exception as e:
            logger.warning(f"Qdrant collection init failed (non-fatal): {e}")

    # Launch startup tasks in background
    import asyncio
    asyncio.create_task(run_startup_tasks())

    yield

    # Cleanup
    from app.models.database import engine
    await engine.dispose()
    logger.info("Application shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Backend API for TJSR - Tracker for Job Search and Reporting",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API router
    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()
