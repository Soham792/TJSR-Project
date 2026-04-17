import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models.database import SessionLocal
from app.models.job import Job
from sqlalchemy import select, func

async def check():
    async with SessionLocal() as db:
        cnt = await db.execute(select(func.count()).select_from(Job))
        print(f"Total Jobs: {cnt.scalar()}")
        
        sample = await db.execute(select(Job).limit(1))
        job = sample.scalar()
        if job:
            print(f"Sample Job: {job.title} | {job.company} | Apply: {job.apply_link}")
        else:
            print("No jobs found in table.")

if __name__ == "__main__":
    asyncio.run(check())
