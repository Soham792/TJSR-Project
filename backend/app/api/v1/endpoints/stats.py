from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from datetime import datetime, timezone, timedelta
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.job import Job
from app.models.application import Application
from app.models.saved_job import SavedJob
from app.models.log import SystemLog
from app.schemas.stats import DashboardStats, ActivityItem

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get aggregated dashboard statistics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    # Total jobs
    total_jobs_result = await db.execute(select(func.count()).select_from(Job))
    total_jobs = total_jobs_result.scalar()

    # Jobs today
    jobs_today_result = await db.execute(
        select(func.count()).select_from(Job).where(Job.date_scraped >= today_start)
    )
    jobs_today = jobs_today_result.scalar()

    # Jobs yesterday (for change calculation)
    jobs_yesterday_result = await db.execute(
        select(func.count()).select_from(Job).where(
            and_(Job.date_scraped >= yesterday_start, Job.date_scraped < today_start)
        )
    )
    jobs_yesterday = jobs_yesterday_result.scalar()

    # Matched jobs (Based on user skills)
    resume_skills = user.resume_skills or []
    if resume_skills:
        # Prepare skills for Postgres ARRAY-style matching
        skills_array = [f"%{s.lower()}%" for s in resume_skills]
        matched_result = await db.execute(
            select(func.count()).select_from(Job).where(
                or_(*[Job.skills.astext.ilike(s) for s in skills_array])
            )
        )
        matched_jobs = matched_result.scalar()
    else:
        # Fallback to general count if no skills (show all jobs found)
        matched_jobs = total_jobs

    # Applications sent
    apps_result = await db.execute(
        select(func.count()).select_from(Application).where(Application.user_id == user.id)
    )
    applications_sent = apps_result.scalar()

    # Saved jobs
    saved_result = await db.execute(
        select(func.count()).select_from(SavedJob).where(SavedJob.user_id == user.id)
    )
    saved_jobs = saved_result.scalar() or 0

    # Change calculations (this week vs last week)
    this_week_result = await db.execute(
        select(func.count()).select_from(Job).where(Job.date_scraped >= week_ago)
    )
    this_week = this_week_result.scalar()

    last_week_result = await db.execute(
        select(func.count()).select_from(Job).where(
            and_(Job.date_scraped >= two_weeks_ago, Job.date_scraped < week_ago)
        )
    )
    last_week = last_week_result.scalar()

    total_change = round(((this_week - last_week) / max(last_week, 1)) * 100, 1)
    today_change = round(((jobs_today - jobs_yesterday) / max(jobs_yesterday, 1)) * 100, 1)

    return DashboardStats(
        total_jobs=total_jobs,
        jobs_today=jobs_today,
        matched_jobs=matched_jobs,
        applications_sent=applications_sent,
        total_jobs_change=total_change,
        jobs_today_change=today_change,
        matched_jobs_change=0,
        applications_change=0,
        saved_jobs=saved_jobs,
        saved_jobs_change=0,
    )


@router.get("/activity", response_model=list[ActivityItem])
async def recent_activity(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get recent activity feed."""
    activities = []

    # Recent applications
    apps_result = await db.execute(
        select(Application)
        .where(Application.user_id == user.id)
        .order_by(Application.applied_date.desc())
        .limit(limit)
    )
    for app in apps_result.scalars():
        activities.append(ActivityItem(
            id=app.id,
            type="applied",
            message=f"Applied to job",
            timestamp=app.applied_date,
            metadata={"job_id": app.job_id, "status": app.status},
        ))

    # Recent logs
    logs_result = await db.execute(
        select(SystemLog)
        .where(SystemLog.user_id == user.id)
        .order_by(SystemLog.created_at.desc())
        .limit(limit)
    )
    for log in logs_result.scalars():
        activities.append(ActivityItem(
            id=log.id,
            type=log.level,
            message=log.message,
            timestamp=log.created_at,
            metadata={"source": log.source},
        ))

    # Sort by timestamp and limit
    activities.sort(key=lambda x: x.timestamp, reverse=True)
    return activities[:limit]


@router.get("/debug-db")
async def debug_db(db: AsyncSession = Depends(get_db)):
    """Debug route to check DB connectivity and row counts."""
    from sqlalchemy import text
    try:
        # Check connection
        await db.execute(text("SELECT 1"))
        
        # Check job count
        job_count_res = await db.execute(select(func.count()).select_from(Job))
        job_count = job_count_res.scalar()
        
        # Check first job
        first_job_res = await db.execute(select(Job).limit(1))
        first_job = first_job_res.scalar()
        
        return {
            "status": "connected",
            "job_count": job_count,
            "has_first_job": first_job is not None,
            "first_job_title": first_job.title if first_job else None,
            "db_time": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "db_time": datetime.now(timezone.utc).isoformat()
        }
