from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, asc, case, any_, column, literal_column
from app.models.database import get_db
from app.dependencies import get_current_user, get_optional_user
from app.models.user import User
from app.models.job import Job
from app.models.saved_job import SavedJob
from app.schemas.job import JobCreate, JobResponse, JobListResponse
from fastapi import HTTPException

router = APIRouter()

# Country name → keywords that may appear in a job's location field.
# Covers the country name itself, common abbreviations, and major cities.
_COUNTRY_KEYWORDS: dict[str, list[str]] = {
    "India": [
        "india", "bangalore", "bengaluru", "mumbai", "delhi", "new delhi",
        "hyderabad", "chennai", "pune", "kolkata", "noida", "gurugram",
        "gurgaon", "ahmedabad", "jaipur", "kochi", "coimbatore", " IN",
    ],
    "United States": [
        "united states", "usa", "u.s.a", "san francisco", "new york", "seattle",
        "austin", "los angeles", "chicago", "boston", "mountain view",
        "sunnyvale", "menlo park", "redmond", "cupertino", " US",
    ],
    "United Kingdom": [
        "united kingdom", "uk", "u.k.", "london", "manchester", "edinburgh",
        "birmingham", "cambridge", "oxford", " GB",
    ],
    "Canada": [
        "canada", "toronto", "vancouver", "montreal", "ottawa", "calgary", " CA",
    ],
    "Germany": [
        "germany", "berlin", "munich", "hamburg", "frankfurt", "stuttgart", " DE",
    ],
    "France": [
        "france", "paris", "lyon", "marseille", "toulouse", " FR",
    ],
    "Australia": [
        "australia", "sydney", "melbourne", "brisbane", "perth", " AU",
    ],
    "Netherlands": [
        "netherlands", "amsterdam", "rotterdam", "eindhoven", " NL",
    ],
    "Singapore": [
        "singapore", " SG",
    ],
    "UAE": [
        "uae", "united arab emirates", "dubai", "abu dhabi", " AE",
    ],
    "Japan": [
        "japan", "tokyo", "osaka", "kyoto", " JP",
    ],
    "China": [
        "china", "beijing", "shanghai", "shenzhen", "guangzhou", " CN",
    ],
    "Ireland": [
        "ireland", "dublin", " IE",
    ],
    "Sweden": [
        "sweden", "stockholm", "gothenburg", "malmo", " SE",
    ],
    "Switzerland": [
        "switzerland", "zurich", "geneva", "basel", " CH",
    ],
    "Spain": [
        "spain", "madrid", "barcelona", "valencia", " ES",
    ],
    "Italy": [
        "italy", "milan", "rome", "turin", " IT",
    ],
    "Brazil": [
        "brazil", "sao paulo", "rio de janeiro", "brasilia", " BR",
    ],
    "South Africa": [
        "south africa", "johannesburg", "cape town", "durban", " ZA",
    ],
    "Remote": [
        "remote", "work from home", "wfh", "anywhere", "distributed",
    ],
}


@router.get("", response_model=JobListResponse)
async def list_jobs(
    search: str | None = Query(None),
    location: list[str] = Query(default=[]),   # zero or more country names
    job_type: list[str] = Query(default=[]),   # zero or more job types
    is_tech: bool | None = Query(None),
    min_confidence: float | None = Query(None),
    skills: str | None = Query(None),          # comma-separated
    salary_max_lpa: int | None = Query(None),  # INR Lakhs Per Annum ceiling
    sort_by: str = Query("date_scraped"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """List jobs with filtering and pagination."""
    query = select(Job)

    # ── Full-text search ──────────────────────────────────────────────
    if search:
        pat = f"%{search}%"
        query = query.where(
            or_(
                Job.title.ilike(pat),
                Job.company.ilike(pat),
                Job.description.ilike(pat),
            )
        )

    # ── Country / Location filter (multi-select, OR across countries) ─
    if location:
        country_conditions = []
        for country in location:
            keywords = _COUNTRY_KEYWORDS.get(country, [country])
            for kw in keywords:
                country_conditions.append(Job.location.ilike(f"%{kw.strip()}%"))
        if country_conditions:
            query = query.where(or_(*country_conditions))

    # ── Job type filter (multi-select, OR) ───────────────────────────
    if job_type:
        query = query.where(Job.job_type.in_(job_type))

    if is_tech is not None:
        query = query.where(Job.is_tech == is_tech)

    if min_confidence is not None:
        query = query.where(Job.confidence_score >= min_confidence)

    if skills:
        skill_list = [s.strip() for s in skills.split(",")]
        for skill in skill_list:
            query = query.where(Job.skills.op("@>")(f'["{skill}"]'))

    # ── Salary ceiling (INR, Lakhs Per Annum) ────────────────────────
    # salary is stored as free text (e.g. "₹12L - ₹18L PA").
    # We filter out jobs whose salary field indicates a figure clearly
    # above the cap by requiring the stored text to match a ₹X pattern
    # where X ≤ salary_max_lpa, OR where no salary is stored at all.
    if salary_max_lpa is not None and salary_max_lpa > 0:
        # Build OR: salary is null/empty, OR salary text contains ₹{N}
        salary_conditions = [
            Job.salary.is_(None),
            Job.salary == "",
        ]
        for lpa in range(1, salary_max_lpa + 1):
            salary_conditions.append(Job.salary.ilike(f"%₹{lpa}L%"))
            salary_conditions.append(Job.salary.ilike(f"%₹{lpa} L%"))
        query = query.where(or_(*salary_conditions))

    # ── Best Match Calculation (SQL-side) ────────────────────────────────
    resume_skills = user.resume_skills if user else None
    dynamically_scored = False
    
    if sort_by == "match_score" and resume_skills:
        # Move scoring to the database for efficiency and pagination
        # We use a LATERAL join to count overlapping skills
        
        # Prepare skills for Postgres ARRAY
        skills_array = [s.lower() for s in resume_skills]
        
        # Subquery to calculate count of overlapping skills
        # We unnest the JSONB skills, lower-case them, and compare to the user's skills
        match_count_subquery = (
            select(func.count())
            .select_from(func.jsonb_array_elements_text(Job.skills).alias("js"))
            .where(column("js").ilike(any_(skills_array)))
            .scalar_subquery()
            .label("dynamic_match_score")
        )
        
        query = query.add_columns(match_count_subquery)
        sort_col = literal_column("dynamic_match_score")
        sort_col_order = desc(sort_col)
        dynamically_scored = True

    # Count total (optimized)
    count_query = select(func.count()).select_from(query.alias("sub"))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # ── Standard sorting ─────────────────────────────────────────────────
    if not dynamically_scored:
        sort_col = getattr(Job, sort_by, Job.date_scraped)
        sort_col_order = desc(sort_col) if sort_order == "desc" else asc(sort_col)

    if search:
        # When searching, put exact company-name matches first, then partial
        # company matches, then everything else in the requested sort order.
        company_boost = case(
            (Job.company.ilike(search), 0),
            (Job.company.ilike(f"%{search}%"), 1),
            else_=2,
        )
        query = query.order_by(company_boost, sort_col_order)
    else:
        query = query.order_by(sort_col_order)

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    
    if dynamically_scored:
        # Extract Job objects from results that now contain extra columns
        jobs_list = [row[0] for row in result.all()]
    else:
        jobs_list = result.scalars().all()

    # Fetch IDs of jobs saved by the user to populate is_saved field
    saved_ids = set()
    if user:
        saved_result = await db.execute(
            select(SavedJob.job_id).where(SavedJob.user_id == user.id)
        )
        saved_ids = {row[0] for row in saved_result.fetchall()}

    response_jobs = []
    for j in jobs_list:
        resp = JobResponse.model_validate(j)
        resp.is_saved = j.id in saved_ids
        response_jobs.append(resp)

    return JobListResponse(
        jobs=response_jobs,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.delete("/cleanup/uuid-titles", dependencies=[Depends(get_current_user)])
async def cleanup_uuid_titles(db: AsyncSession = Depends(get_db)):
    """
    Delete jobs whose title is an ATS-internal UUID / hex string
    (e.g. Workday React internal IDs like 654c6aaa25ad...).
    """
    import re as _re
    from sqlalchemy import delete as sql_delete

    result = await db.execute(select(Job.id, Job.title))
    rows = result.fetchall()

    uuid_pat = _re.compile(r'^[0-9a-f]{8,}', _re.IGNORECASE)
    ids_to_delete = [row.id for row in rows if uuid_pat.match(row.title or "")]

    deleted = 0
    if ids_to_delete:
        del_result = await db.execute(
            sql_delete(Job).where(Job.id.in_(ids_to_delete)).returning(Job.id)
        )
        deleted = len(del_result.fetchall())
        await db.commit()

    return {"deleted": deleted, "message": f"Removed {deleted} UUID-titled job rows"}


@router.delete("/cleanup/garbage", dependencies=[Depends(get_current_user)])
async def cleanup_garbage_jobs(db: AsyncSession = Depends(get_db)):
    """
    Delete job rows whose titles look like JSON fragments or raw HTML.
    Call once after the scraper fix to clean up existing bad data.
    """
    from sqlalchemy import delete as sql_delete

    # Patterns that identify garbage titles stored by the old NLP extractor
    garbage_patterns = [
        '%"type"%',        # JSON key fragments
        '%{%',             # JSON object start
        '%[%:%]%',         # JSON-like colon patterns
        '% ": "%',         # JSON value fragments
        '%\\u00%',         # unicode escapes
        '%function(%',     # JS code
    ]

    total_deleted = 0
    for pattern in garbage_patterns:
        result = await db.execute(
            sql_delete(Job).where(Job.title.like(pattern)).returning(Job.id)
        )
        total_deleted += len(result.fetchall())

    await db.commit()
    return {"deleted": total_deleted, "message": f"Removed {total_deleted} garbage job rows"}


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single job by ID."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse.model_validate(job)


@router.post("", response_model=JobResponse)
async def create_job(
    job_data: JobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually create a job entry."""
    job = Job(
        title=job_data.title,
        company=job_data.company,
        location=job_data.location,
        description=job_data.description,
        skills=job_data.skills,
        job_type=job_data.job_type,
        salary=job_data.salary,
        apply_link=job_data.apply_link,
        source_url=job_data.source_url,
        source_name=job_data.source_name or "manual",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Trigger async processing pipeline
    from app.workers.tasks import process_job_pipeline
    process_job_pipeline.delay(job.id)

    return JobResponse.model_validate(job)


@router.get("/search/semantic")
async def semantic_search(
    q: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search jobs using semantic similarity via Qdrant."""
    from app.services.rag.retriever import search_similar_jobs

    results = await search_similar_jobs(q, limit=limit)
    if not results:
        return {"jobs": [], "total": 0}

    job_ids = [r["job_id"] for r in results]
    result = await db.execute(select(Job).where(Job.id.in_(job_ids)))
    jobs = result.scalars().all()
    jobs_map = {j.id: j for j in jobs}

    response_jobs = []
    for r in results:
        job = jobs_map.get(r["job_id"])
        if job:
            job_resp = JobResponse.model_validate(job)
            response_jobs.append({"job": job_resp, "relevance_score": r["score"]})

    return {"jobs": response_jobs, "total": len(response_jobs)}


@router.get("/saved/all", response_model=JobListResponse)
async def list_saved_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all jobs saved by the current user."""
    # Count total
    count_query = select(func.count(SavedJob.job_id)).where(SavedJob.user_id == user.id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Fetch jobs
    query = (
        select(Job)
        .join(SavedJob, Job.id == SavedJob.job_id)
        .where(SavedJob.user_id == user.id)
        .order_by(desc(SavedJob.saved_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    jobs = result.scalars().all()

    response_jobs = []
    for j in jobs:
        resp = JobResponse.model_validate(j)
        resp.is_saved = True
        response_jobs.append(resp)

    return JobListResponse(
        jobs=response_jobs,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.post("/{job_id}/save")
async def save_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save a job to the user's bookmarks."""
    # Check if job exists
    job_check = await db.execute(select(Job.id).where(Job.id == job_id))
    if not job_check.scalar():
        raise HTTPException(status_code=404, detail="Job not found")

    # Check if already saved
    existing = await db.execute(
        select(SavedJob).where(SavedJob.user_id == user.id, SavedJob.job_id == job_id)
    )
    if existing.scalar_one_or_none():
        return {"status": "already_saved"}

    new_save = SavedJob(user_id=user.id, job_id=job_id)
    db.add(new_save)
    await db.commit()
    return {"status": "saved"}


@router.delete("/{job_id}/save")
async def unsave_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a job from the user's bookmarks."""
    from sqlalchemy import delete as sql_delete
    
    result = await db.execute(
        sql_delete(SavedJob).where(SavedJob.user_id == user.id, SavedJob.job_id == job_id)
    )
    await db.commit()
    
    if result.rowcount == 0:
        return {"status": "not_found_in_saved"}
        
    return {"status": "unsaved"}
