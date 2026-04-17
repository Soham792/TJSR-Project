from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def health_check():
    services = {}

    # PostgreSQL (use sync engine to avoid asyncpg+PgBouncer prepared-statement issues)
    try:
        from sqlalchemy import create_engine, text as sync_text
        from app.config import get_settings
        settings = get_settings()
        _engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
        with _engine.connect() as conn:
            conn.execute(sync_text("SELECT 1"))
        _engine.dispose()
        services["postgres"] = "healthy"
    except Exception as e:
        services["postgres"] = f"unhealthy: {e}"

    # Redis
    try:
        import redis as redis_lib
        from app.config import get_settings
        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url)
        r.ping()
        services["redis"] = "healthy"
        r.close()
    except Exception as e:
        services["redis"] = f"unhealthy: {e}"

    # Neo4j
    try:
        from app.config import get_settings
        settings = get_settings()
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
        driver.verify_connectivity()
        services["neo4j"] = "healthy"
        driver.close()
    except Exception as e:
        services["neo4j"] = f"unhealthy: {e}"

    # Qdrant
    try:
        from qdrant_client import QdrantClient
        from app.config import get_settings
        settings = get_settings()
        host = settings.qdrant_host
        if host.startswith("http://") or host.startswith("https://"):
            kwargs = {"url": host, "timeout": 5}
            if settings.qdrant_api_key:
                kwargs["api_key"] = settings.qdrant_api_key
        else:
            kwargs = {"host": host, "port": settings.qdrant_port, "timeout": 5}
        client = QdrantClient(**kwargs)
        client.get_collections()
        services["qdrant"] = "healthy"
        client.close()
    except Exception as e:
        services["qdrant"] = f"unhealthy: {e}"

    # Featherless
    try:
        import httpx
        from app.config import get_settings
        settings = get_settings()
        headers = {}
        if settings.featherless_api_key:
            headers["Authorization"] = f"Bearer {settings.featherless_api_key}"
        resp = httpx.get(f"{settings.featherless_api_url}/models", headers=headers, timeout=5)
        if resp.status_code == 200:
            services["featherless"] = "healthy"
        else:
            services["featherless"] = f"unhealthy: status {resp.status_code}"
    except Exception as e:
        services["featherless"] = f"unhealthy: {e}"

    all_healthy = all(v == "healthy" for v in services.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": services,
    }
