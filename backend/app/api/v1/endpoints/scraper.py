from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.scraper_config import ScraperConfig
from app.models.log import SystemLog
from app.schemas.scraper import (
    ScraperConfigCreate, ScraperConfigUpdate, ScraperConfigResponse,
    ScraperRunRequest, ScraperStatus, CompanyScraperStatus,
    ScraperTestRequest, ScraperTestResult, ExtractedJobResult,
)
import redis as redis_lib
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/configs", response_model=list[ScraperConfigResponse])
async def list_scraper_configs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List user's scraper configurations."""
    result = await db.execute(
        select(ScraperConfig)
        .where(ScraperConfig.user_id == user.id)
        .order_by(ScraperConfig.created_at.desc())
    )
    configs = result.scalars().all()
    return [ScraperConfigResponse.model_validate(c) for c in configs]


@router.post("/configs", response_model=ScraperConfigResponse)
async def create_scraper_config(
    data: ScraperConfigCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new scraper data source."""
    config = ScraperConfig(
        user_id=user.id,
        source_type=data.source_type,
        source_url=data.source_url,
        source_name=data.source_name,
        scraper_engine=data.scraper_engine,
        schedule_cron=data.schedule_cron,
        config_json=data.config_json,
    )
    db.add(config)

    # Log the event
    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level="info",
        message=f"Added scraper source: {data.source_name or data.source_url}",
    )
    db.add(log)

    await db.commit()
    await db.refresh(config)
    return ScraperConfigResponse.model_validate(config)


@router.put("/configs/{config_id}", response_model=ScraperConfigResponse)
async def update_scraper_config(
    config_id: str,
    data: ScraperConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a scraper config."""
    result = await db.execute(
        select(ScraperConfig).where(
            ScraperConfig.id == config_id, ScraperConfig.user_id == user.id
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(config, field, value)

    await db.commit()
    await db.refresh(config)
    return ScraperConfigResponse.model_validate(config)


@router.delete("/configs/{config_id}")
async def delete_scraper_config(
    config_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a scraper config."""
    result = await db.execute(
        select(ScraperConfig).where(
            ScraperConfig.id == config_id, ScraperConfig.user_id == user.id
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    await db.delete(config)
    await db.commit()
    return {"message": "Config deleted"}


@router.get("/companies")
async def list_companies():
    """Return the list of all available company scraping sources (no auth needed)."""
    from app.services.scraper.company_scraper import COMPANY_SOURCES
    return [
        {"name": s["name"], "url": s["url"]}
        for s in COMPANY_SOURCES
    ]


@router.post("/run/companies")
async def run_company_scraper(
    data: ScraperRunRequest = ScraperRunRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Trigger the company career-page scraper in a background thread.
    Returns immediately; progress is polled via /company-status every 3 s.

    We do NOT use Celery here: even when the Redis broker is reachable the
    task would sit in the queue forever if no Celery worker process is running.
    A plain daemon thread is simpler, always works, and publishes the same
    Redis status key that the frontend polls.
    """
    import threading
    from app.services.scraper.company_scraper import CompanyScraper

    company_names = data.company_names

    def _run_in_background():
        logger.info(f"[Scraper] Background thread started — {company_names or 'ALL'}")
        try:
            result = CompanyScraper().run(company_names=company_names)
            logger.info(f"[Scraper] Done: {result.get('jobs_found', 0)} jobs, "
                        f"{result.get('sources_completed', 0)}/{result.get('sources_total', 0)} sources, "
                        f"errors={result.get('errors', [])}")
        except Exception as e:
            logger.error(f"[Scraper] Background thread crashed: {e}", exc_info=True)

    t = threading.Thread(target=_run_in_background, daemon=True, name="company-scraper")
    t.start()
    logger.info("[Scraper] Background thread launched, returning HTTP response immediately")

    label = ", ".join(company_names) if company_names else "ALL companies"
    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level="info",
        message=f"Company scraper started (background thread): {label}",
    )
    db.add(log)
    await db.commit()

    return {"task_id": None, "status": "started", "mode": "background"}


@router.get("/company-status", response_model=CompanyScraperStatus)
async def company_scraper_status():
    """Get current company scraper progress (no auth — used by frontend polling)."""
    from app.config import get_settings
    settings = get_settings()
    try:
        url = settings.redis_url
        r = redis_lib.from_url(
            url, 
            ssl_cert_reqs="none",
            socket_timeout=2,
            socket_connect_timeout=2
        ) if url.startswith("rediss://") else redis_lib.from_url(
            url,
            socket_timeout=2,
            socket_connect_timeout=2
        )
        raw = r.get("company_scraper:status")
        r.close()
    except Exception as e:
        logger.warning(f"Redis unavailable for status poll: {e}")
        return CompanyScraperStatus(is_running=False)

    if not raw:
        return CompanyScraperStatus(is_running=False)

    data = json.loads(raw)
    return CompanyScraperStatus(
        is_running=data.get("is_running", False),
        progress=data.get("progress", 0),
        jobs_found=data.get("jobs_found", 0),
        sources_completed=data.get("sources_completed", 0),
        sources_total=data.get("sources_total", 0),
        current_source=data.get("current_source"),
        last_run_at=data.get("last_run_at"),
    )


@router.post("/stop/companies")
async def stop_company_scraper(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Signal the background company scraper to stop after its current source.
    Sets a Redis flag that CompanyScraper.run() checks between companies.
    """
    from app.config import get_settings
    settings = get_settings()
    try:
        url = settings.redis_url
        r = redis_lib.from_url(
            url,
            ssl_cert_reqs="none",
            socket_timeout=3,
            socket_connect_timeout=3,
        ) if url.startswith("rediss://") else redis_lib.from_url(
            url, socket_timeout=3, socket_connect_timeout=3
        )
        r.set("company_scraper:stop_requested", "1", ex=300)
        r.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Redis unavailable: {e}")

    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level="info",
        message="Company scraper stop requested",
    )
    db.add(log)
    await db.commit()
    return {"status": "stop_requested"}


@router.post("/run")
async def run_scraper(
    data: ScraperRunRequest = ScraperRunRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger a scraping run (config-based, legacy)."""
    from app.workers.tasks import run_scraper as run_scraper_task

    task = run_scraper_task.delay(
        config_ids=data.config_ids,
        user_id=user.id,
    )

    # Store task id in Redis for status tracking
    from app.config import get_settings
    settings = get_settings()
    try:
        r = redis_lib.from_url(
            settings.redis_url,
            socket_timeout=5,
            socket_connect_timeout=5
        )
        r.set(f"scraper:task:{user.id}", task.id, ex=3600)
        r.close()
    except Exception as e:
        logger.warning(f"Failed to store task ID in Redis: {e}")

    # Log
    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level="info",
        message="Scraper run started",
    )
    db.add(log)
    await db.commit()

    return {"task_id": task.id, "status": "started"}


@router.post("/stop")
async def stop_scraper(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stop a running scraper task."""
    from app.config import get_settings
    settings = get_settings()
    try:
        r = redis_lib.from_url(
            settings.redis_url,
            socket_timeout=5,
            socket_connect_timeout=5
        )
        task_id = r.get(f"scraper:task:{user.id}")
        r.close()
    except Exception as e:
        logger.warning(f"Failed to get task ID from Redis: {e}")
        task_id = None

    if not task_id:
        raise HTTPException(status_code=404, detail="No running scraper task")

    from app.workers.celery_app import celery_app
    celery_app.control.revoke(task_id.decode(), terminate=True)

    return {"message": "Scraper stopped"}


@router.get("/status", response_model=ScraperStatus)
async def scraper_status(
    user: User = Depends(get_current_user),
):
    """Get current scraper status."""
    from app.config import get_settings
    settings = get_settings()
    try:
        r = redis_lib.from_url(
            settings.redis_url,
            socket_timeout=5,
            socket_connect_timeout=5
        )
        task_id = r.get(f"scraper:task:{user.id}")
        status_data = r.get(f"scraper:status:{user.id}")
        r.close()
    except Exception as e:
        logger.warning(f"Redis unavailable for status check: {e}")
        return ScraperStatus(is_running=False)

    if not task_id:
        return ScraperStatus(is_running=False)

    status = ScraperStatus(is_running=True, current_task_id=task_id.decode())

    if status_data:
        data = json.loads(status_data)
        status.progress = data.get("progress", 0)
        status.jobs_found = data.get("jobs_found", 0)
        status.sources_completed = data.get("sources_completed", 0)
        status.sources_total = data.get("sources_total", 0)
        status.current_source = data.get("current_source")
        status.errors = data.get("errors", [])

    return status


@router.websocket("/ws")
async def scraper_websocket(websocket: WebSocket):
    """WebSocket for real-time scraper progress updates."""
    await websocket.accept()

    from app.config import get_settings
    settings = get_settings()

    try:
        # Get user token from query params
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Missing token")
            return

        from app.services.firebase_auth import verify_firebase_token
        claims = await verify_firebase_token(token)
        if not claims:
            await websocket.close(code=4001, reason="Invalid token")
            return

        user_uid = claims.get("uid")

        # Subscribe to Redis pub/sub for this user's scraper events
        r = redis_lib.from_url(settings.redis_url)
        pubsub = r.pubsub()
        pubsub.subscribe(f"scraper:events:{user_uid}")

        import asyncio
        while True:
            message = pubsub.get_message(timeout=1.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"].decode())

            # Check if client sent anything (keepalive/close)
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        try:
            pubsub.unsubscribe()
            r.close()
        except Exception:
            pass


@router.post("/run/sync")
async def run_scraper_sync(
    data: ScraperRunRequest = ScraperRunRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Run the scraper synchronously (no Celery worker required).
    Saves jobs to the database and returns a full result summary.
    """
    import asyncio
    from functools import partial
    from app.services.scraper.manager import ScraperManager

    loop = asyncio.get_event_loop()
    manager = ScraperManager()

    try:
        result = await loop.run_in_executor(
            None,
            partial(manager.run, data.config_ids, user.id),
        )
    except Exception as e:
        logger.error(f"Sync scraper run failed: {e}")
        result = {"jobs_found": 0, "sources_completed": 0, "sources_total": 0, "errors": [str(e)]}

    level = "success" if result["jobs_found"] > 0 else ("error" if result["errors"] else "warning")
    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level=level,
        message=(
            f"Sync run: {result['jobs_found']} jobs from "
            f"{result['sources_completed']}/{result['sources_total']} sources"
            + (f" | Errors: {len(result['errors'])}" if result["errors"] else "")
        ),
    )
    db.add(log)
    await db.commit()

    return result


@router.post("/test", response_model=ScraperTestResult)
async def test_scrape(
    data: ScraperTestRequest,
    user: User = Depends(get_current_user),
):
    """Test-scrape a URL without saving to the database. Returns raw content + extracted jobs."""
    import time
    import asyncio
    from functools import partial
    from app.services.scraper.bs4_scraper import BS4Scraper
    from app.services.scraper.selenium_scraper import SeleniumScraper
    from app.services.scraper.scrapling_scraper import ScraplingEngine
    from app.services.scraper.crawl4ai_scraper import Crawl4AIScraper
    from app.services.scraper.newspaper_scraper import NewspaperScraper
    from app.services.scraper.phenom_scraper import PhenomScraper
    from app.services.scraper.google_careers_scraper import GoogleCareersScraper
    from app.services.scraper.nlp_extractor import extract_jobs_from_content

    ENGINE_MAP = {
        "bs4": BS4Scraper,
        "selenium": SeleniumScraper,
        "scrapling": ScraplingEngine,
        "crawl4ai": Crawl4AIScraper,
        "newspaper": NewspaperScraper,
        "phenom": PhenomScraper,
        "google_careers": GoogleCareersScraper,
    }
    ENGINE_PRIORITY = ["bs4", "scrapling", "crawl4ai", "selenium", "newspaper"]

    errors: list[str] = []
    raw_contents = []
    engine_used = data.engine
    config = data.config_json or {}
    start = time.time()
    loop = asyncio.get_event_loop()

    def _get_instance(name: str):
        try:
            return ENGINE_MAP[name]()
        except Exception as e:
            errors.append(f"Could not instantiate engine '{name}': {e}")
            return None

    async def _try_engine(name: str) -> list:
        inst = _get_instance(name)
        if not inst:
            return []
        try:
            return await loop.run_in_executor(None, partial(inst.scrape, data.url, config))
        except Exception as e:
            errors.append(f"Engine '{name}' failed: {e}")
            return []

    if data.engine != "auto":
        raw_contents = await _try_engine(data.engine)
        if not raw_contents:
            engine_used = "auto (fallback)"

    if not raw_contents:
        for name in ENGINE_PRIORITY:
            if data.engine != "auto" and name == data.engine:
                continue  # Already tried
            result = await _try_engine(name)
            if result:
                raw_contents = result
                engine_used = name
                break

    elapsed = round(time.time() - start, 2)

    if not raw_contents:
        return ScraperTestResult(
            engine_used=engine_used,
            url=data.url,
            raw_text_preview="",
            raw_text_length=0,
            links_found=0,
            jobs_extracted=[],
            errors=errors or ["All engines returned no content"],
            elapsed_seconds=elapsed,
        )

    # Combine all raw content for display
    all_text = "\n\n---\n\n".join(c.text for c in raw_contents if c.text)
    all_links = [link for c in raw_contents for link in (c.links or [])]

    # Run NLP extraction on each content block
    jobs_extracted: list[ExtractedJobResult] = []
    for content in raw_contents:
        extracted = extract_jobs_from_content(
            text=content.text,
            url=content.url or data.url,
            html=content.html or "",
            metadata=content.metadata or {},
        )
        for job in extracted:
            jobs_extracted.append(ExtractedJobResult(
                title=job.title,
                company=job.company,
                location=job.location,
                description=job.description[:500],
                skills=job.skills,
                job_type=job.job_type,
                salary=job.salary,
                apply_link=job.apply_link,
            ))

    return ScraperTestResult(
        engine_used=engine_used,
        url=data.url,
        raw_text_preview=all_text[:3000],
        raw_text_length=len(all_text),
        links_found=len(set(all_links)),
        jobs_extracted=jobs_extracted,
        errors=errors,
        elapsed_seconds=elapsed,
    )
