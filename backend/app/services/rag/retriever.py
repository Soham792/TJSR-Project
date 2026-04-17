"""Qdrant similarity search for RAG retrieval."""

import logging
from qdrant_client.models import Filter, FieldCondition, MatchValue
from app.services.rag.embedder import embed_text
from app.services.rag.indexer import get_qdrant_client, JOB_COLLECTION, RESUME_COLLECTION
from sqlalchemy import create_engine, select, func, and_
from sqlalchemy.orm import Session
from app.models.job import Job
from app.models.application import Application
from app.config import get_settings
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def search_similar_jobs(
    query: str,
    limit: int = 10,
    is_tech_only: bool = False,
) -> list[dict]:
    """Search for semantically similar jobs."""
    embedding = embed_text(query)
    if not embedding:
        return []

    client = get_qdrant_client()
    if not client:
        return []

    try:
        search_filter = None
        if is_tech_only:
            search_filter = Filter(
                must=[FieldCondition(key="is_tech", match=MatchValue(value=True))]
            )

        results = client.search(
            collection_name=JOB_COLLECTION,
            query_vector=embedding,
            limit=limit,
            query_filter=search_filter,
            with_payload=True,
        )

        return [
            {
                "job_id": r.payload.get("job_id"),
                "title": r.payload.get("title"),
                "company": r.payload.get("company"),
                "score": round(r.score, 4),
            }
            for r in results
            if r.payload.get("job_id")
        ]
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return []
    finally:
        client.close()


async def search_resume_sections(
    query: str,
    user_id: str,
    limit: int = 5,
) -> list[dict]:
    """Search user's resume sections."""
    embedding = embed_text(query)
    if not embedding:
        return []

    client = get_qdrant_client()
    if not client:
        return []

    try:
        results = client.search(
            collection_name=RESUME_COLLECTION,
            query_vector=embedding,
            limit=limit,
            query_filter=Filter(
                must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
            ),
            with_payload=True,
        )

        return [
            {
                "section": r.payload.get("section"),
                "content": r.payload.get("content"),
                "score": round(r.score, 4),
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"Resume section search failed: {e}")
        return []
    finally:
        client.close()


async def get_context_for_query(query: str, user_id: str | None = None, limit: int = 5) -> str:
    """Build a comprehensive context string from jobs, stats, and the user's resume."""
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    
    # 1. Fetch Platform Stats
    stats_str = "No platform stats available."
    with Session(engine) as session:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        total_jobs = session.execute(select(func.count()).select_from(Job)).scalar() or 0
        jobs_today = session.execute(
            select(func.count()).select_from(Job).where(Job.date_scraped >= today_start)
        ).scalar() or 0
        matches = session.execute(
            select(func.count()).select_from(Job).where(
                and_(Job.is_tech == True, Job.confidence_score >= 0.7)
            )
        ).scalar() or 0
        
        stats_str = (
            f"Current Platform Stats:\n"
            f"- Total Jobs in Database: {total_jobs}\n"
            f"- New Jobs Found Today: {jobs_today}\n"
            f"- High-Quality AI Matches: {matches}\n"
        )

    # 2. Fetch User Resume Context (if user_id provided)
    resume_str = ""
    if user_id:
        resume_results = await search_resume_sections(query, user_id, limit=3)
        if resume_results:
            resume_content = "\n".join([f"[{r['section']}]: {r['content']}" for r in resume_results])
            resume_str = f"Context from User's Resume:\n{resume_content}\n"

    # 3. Fetch Relevant Jobs
    job_results = await search_similar_jobs(query, limit=limit)
    job_context = "No relevant job postings found for this specific query."
    if job_results:
        context_parts = []
        with Session(engine) as session:
            for r in job_results:
                job = session.execute(
                    select(Job).where(Job.id == r["job_id"])
                ).scalar_one_or_none()

                if job:
                    context_parts.append(
                        f"Job: {job.title} at {job.company}\n"
                        f"Location: {job.location or 'N/A'}\n"
                        f"Skills: {', '.join(job.skills or [])}\n"
                        f"Salary: {job.salary or 'N/A'}\n"
                        f"Description: {(job.description or '')[:200]}..."
                    )
        job_context = "Context from Job Postings:\n" + "\n---\n".join(context_parts)

    return f"{stats_str}\n{resume_str}\n{job_context}"
