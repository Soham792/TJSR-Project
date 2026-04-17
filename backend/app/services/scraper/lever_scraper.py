"""
Lever Job Board API scraper.

Public endpoint (no auth required):
  GET https://api.lever.co/v0/postings/{company}?mode=json

Returns an array of job posting objects — no browser needed.
"""

import html as html_lib
import logging
import time
import re
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

# Lever slug → display name
LEVER_COMPANIES: dict[str, str] = {
    "netflix":  "Netflix",
    "zomato":   "Zomato",
    "swiggy":   "Swiggy",
}

BASE_URL = "https://api.lever.co/v0/postings/{slug}"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def _strip_html(raw: str) -> str:
    """Strip HTML tags and normalise whitespace."""
    if not raw:
        return ""
    text = html_lib.unescape(raw)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z]+;|&#\d+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:5000]


def fetch_lever_jobs(slug: str, display_name: str) -> list[dict]:
    """
    Call the Lever API for one company and return a list of clean job dicts:
      {title, company, location, description, apply_link, date_posted, skills, job_type}
    Returns an empty list on any error.
    """
    url = BASE_URL.format(slug=slug)
    try:
        resp = requests.get(
            url,
            params={"mode": "json"},
            headers=_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.warning(f"[Lever] No board found for slug '{slug}' (404)")
        else:
            logger.error(f"[Lever] HTTP error for '{slug}': {e}")
        return []
    except Exception as e:
        logger.error(f"[Lever] Request failed for '{slug}': {e}")
        return []

    if not isinstance(data, list):
        logger.info(f"[Lever] Unexpected response format for '{slug}'")
        return []

    if not data:
        logger.info(f"[Lever] 0 jobs returned for '{slug}'")
        return []

    results = []
    for job in data:
        title = (job.get("text") or "").strip()
        if not title:
            continue

        categories = job.get("categories") or {}
        location = (categories.get("location") or "").strip() or "Not specified"
        commitment = (categories.get("commitment") or "Full-time").strip()

        # Normalise commitment → our job_type values
        job_type = "Full-time"
        cl = commitment.lower()
        if "part" in cl:
            job_type = "Part-time"
        elif "contract" in cl or "freelance" in cl:
            job_type = "Contract"
        elif "intern" in cl:
            job_type = "Internship"

        apply_link = job.get("hostedUrl") or job.get("applyUrl") or ""

        desc_html = job.get("description") or job.get("descriptionPlain") or ""
        if "<" in desc_html:
            description = _strip_html(desc_html)
        else:
            description = (desc_html or "")[:5000]

        # Parse timestamp (Lever gives milliseconds since epoch)
        created_ms = job.get("createdAt")
        date_posted: datetime | None = None
        if created_ms:
            try:
                date_posted = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc)
            except Exception:
                pass

        from app.services.scraper.nlp_extractor import _extract_skills
        skills = _extract_skills(description) if description else []

        results.append({
            "title":       title,
            "company":     display_name,
            "location":    location,
            "description": description,
            "apply_link":  apply_link,
            "date_posted": date_posted,
            "skills":      skills,
            "job_type":    job_type,
        })

    logger.info(f"[Lever] '{slug}' → {len(results)} jobs")
    return results


def fetch_all_lever_jobs(
    slugs: list[str] | None = None,
    delay: float = 1.5,
) -> list[dict]:
    """
    Fetch jobs from all (or a subset of) Lever companies.
    *delay* seconds between requests to be polite.
    """
    targets = slugs if slugs else list(LEVER_COMPANIES.keys())
    all_jobs: list[dict] = []

    for slug in targets:
        display = LEVER_COMPANIES.get(slug, slug.title())
        jobs = fetch_lever_jobs(slug, display)
        all_jobs.extend(jobs)
        time.sleep(delay)

    return all_jobs
