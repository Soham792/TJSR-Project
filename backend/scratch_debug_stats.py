import asyncio
import os
import sys

# Add the backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models.database import SessionLocal
from app.models.job import Job
from app.models.scraper_config import ScraperConfig
from app.models.log import SystemLog
from sqlalchemy import select, func

async def check():
    async with SessionLocal() as db:
        # Check jobs
        jobs_cnt = await db.execute(select(func.count()).select_from(Job))
        print(f"Total Jobs: {jobs_cnt.scalar()}")
        
        # Check configs
        configs = await db.execute(select(ScraperConfig))
        print("\n--- Scraper Configs ---")
        for c in configs.scalars():
            print(f"ID: {c.id}, Source: {c.source_name}, Enabled: {c.enabled}, Last Run: {c.last_run_at}")
            
        # Check logs
        logs = await db.execute(select(SystemLog).order_by(SystemLog.created_at.desc()).limit(10))
        print("\n--- Recent Logs ---")
        for l in logs.scalars():
            print(f"[{l.created_at}] {l.level}: {l.message}")

if __name__ == "__main__":
    asyncio.run(check())
