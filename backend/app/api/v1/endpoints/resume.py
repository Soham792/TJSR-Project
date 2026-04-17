import json
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.models.user import User
from app.dependencies import get_current_user
from app.services.resume.skill_extractor import parse_resume
from app.services.firebase_auth import upload_file_to_storage

router = APIRouter()

_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
_ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
}


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upload a resume (PDF / DOCX / TXT).
    Extracts skills using NER-style keyword matching and stores them on the user.
    Returns the extracted skill list.
    """
    # Basic validation
    if file.content_type and file.content_type not in _ALLOWED_TYPES:
        # Also allow if content_type is generic octet-stream
        if file.content_type != "application/octet-stream":
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}. Upload PDF, DOCX, or TXT.",
            )

    data = await file.read()
    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5 MB.")

    filename = file.filename or "resume.pdf"
    _text, skills = parse_resume(filename, data)

    # NEW: Upload to Firebase Storage via backend
    resume_url = upload_file_to_storage(
        user_id=user.firebase_uid,
        filename=filename,
        content=data,
        content_type=file.content_type or "application/pdf"
    )

    if not resume_url:
        raise HTTPException(
            status_code=500,
            detail="Cloud Storage failed. Please check backend logs or Firebase permissions."
        )

    if not skills:
        return {
            "skills": [],
            "resume_url": resume_url,
            "message": "No recognisable tech skills found in the resume. "
                       "Make sure the file contains readable text.",
        }

    # Persist via raw SQL with explicit JSONB cast — works even if the ORM
    # session already has a detached/temp user object from the dependency.
    try:
        await db.execute(
            sql_text(
                "UPDATE users SET resume_skills = CAST(:skills AS JSONB) "
                "WHERE firebase_uid = :uid"
            ),
            {"skills": json.dumps(skills), "uid": user.firebase_uid},
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=503,
            detail=(
                "Resume skills could not be saved. "
                "Please restart the backend server to apply pending migrations."
            ),
        ) from e

    return {
        "skills": skills, 
        "resume_url": resume_url,
        "count": len(skills), 
        "message": f"Extracted {len(skills)} skills from your resume."
    }


@router.get("/skills")
async def get_resume_skills(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the skills extracted from the user's most-recently uploaded resume."""
    # Prefer fresh DB read to avoid stale cached values on the ORM object
    try:
        row = await db.execute(
            sql_text("SELECT resume_skills FROM users WHERE firebase_uid = :uid"),
            {"uid": user.firebase_uid},
        )
        result = row.fetchone()
        skills = (result[0] or []) if result else []
    except Exception:
        skills = user.resume_skills or []
    return {"skills": skills, "count": len(skills)}


@router.delete("/skills")
async def clear_resume_skills(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clear extracted resume skills for the current user."""
    user.resume_skills = None
    db.add(user)
    await db.commit()
    return {"message": "Resume skills cleared."}
