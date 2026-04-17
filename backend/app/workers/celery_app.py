from celery import Celery
from celery.schedules import crontab
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env so os.getenv picks up CELERY_BROKER_URL / CELERY_RESULT_BACKEND
# whether this module is imported by uvicorn or a standalone celery worker.
_env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_env_path, override=False)

celery_app = Celery(
    "tjsr",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2"),
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery_app.conf.beat_schedule = {
    "send-daily-digest": {
        "task": "app.workers.tasks.send_daily_digest",
        "schedule": crontab(hour=8, minute=0),
    },
    # Scrape all company career pages every 30 minutes
    "run-company-scraper": {
        "task": "app.workers.tasks.run_company_scraper",
        "schedule": crontab(minute="*/30"),
        "args": (None,),   # None = scrape all companies
    },
}

celery_app.autodiscover_tasks(["app.workers"])
