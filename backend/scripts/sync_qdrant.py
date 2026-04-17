import asyncio
import os
import sys
import uuid
import logging

# Add backend to path
sys.path.append(os.path.abspath("."))

from app.models.database import engine
from app.models.job import Job
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.services.rag.indexer import (
    get_qdrant_client, 
    JOB_COLLECTION, 
    VECTOR_SIZE, 
    ensure_collections
)
from app.services.rag.embedder import embed_text, build_job_text
from qdrant_client.models import PointStruct

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_qdrant")

async def sync_all_jobs():
    logger.info("Starting batch sync of jobs to Qdrant...")
    
    # 1. Ensure collections exist
    ensure_collections()
    client = get_qdrant_client()
    if not client:
        logger.error("Could not connect to Qdrant!")
        return

    # 2. Fetch all jobs from DB
    async with engine.connect() as conn:
        # We use a sync session over the async engine connection if needed, 
        # or just use the async connection directly.
        # For simplicity, we'll fetch all IDs first.
        res = await conn.execute(select(Job.id))
        job_ids = [row[0] for row in res.fetchall()]
    
    logger.info(f"Found {len(job_ids)} jobs in database.")

    # 3. Process in batches
    batch_size = 50
    indexed_count = 0
    
    # Reuse a sync engine for the indexing function mapping
    from sqlalchemy import create_engine
    from app.config import get_settings
    settings = get_settings()
    sync_engine = create_engine(settings.sync_database_url)

    for i in range(0, len(job_ids), batch_size):
        batch_ids = job_ids[i:i + batch_size]
        points = []
        
        with Session(sync_engine) as session:
            jobs = session.execute(select(Job).where(Job.id.in_(batch_ids))).scalars().all()
            
            for job in jobs:
                text = build_job_text(
                    title=job.title,
                    company=job.company,
                    location=job.location or "",
                    description=job.description or "",
                    skills=job.skills or [],
                )
                
                embedding = embed_text(text)
                if not embedding:
                    continue
                
                point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, job.id))
                points.append(PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "job_id": job.id,
                        "title": job.title,
                        "company": job.company,
                        "skills": job.skills or [],
                        "is_tech": job.is_tech,
                        "date_scraped": job.date_scraped.isoformat() if job.date_scraped else None,
                    }
                ))
                
                # Update job with embedding id
                job.embedding_id = point_id
            
            session.commit()

        if points:
            client.upsert(collection_name=JOB_COLLECTION, points=points)
            indexed_count += len(points)
            logger.info(f"Progress: {indexed_count}/{len(job_ids)} jobs indexed.")

    client.close()
    logger.info(f"Sync complete! Total indexed: {indexed_count}")

if __name__ == "__main__":
    asyncio.run(sync_all_jobs())
