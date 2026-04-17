"""
Greenhouse Job Board API scraper.

Public endpoint (no auth required):
  GET https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true

Returns structured JSON — no browser / Playwright needed.
"""

import html as html_lib
import logging
import time
import re
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

# Greenhouse slug → display name
GREENHOUSE_COMPANIES: dict[str, str] = {
    "stripe":     "Stripe",
    "airbnb":     "Airbnb",
    "shopify":    "Shopify",
    "notion":     "Notion",
    "discord":    "Discord",
    "robinhood":  "Robinhood",
    "coinbase":   "Coinbase",
    "dropbox":    "Dropbox",
    "intercom":   "Intercom",
    "figma":      "Figma",
}

BASE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"

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
    # Unescape first so that &lt;div&gt; → <div> before the tag regex runs
    text = html_lib.unescape(raw)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z]+;|&#\d+;", " ", text)   # any remaining entities
    text = re.sub(r"\s+", " ", text).strip()
    return text[:5000]


def fetch_greenhouse_jobs(slug: str, display_name: str) -> list[dict]:
    """
    Call the Greenhouse API for one company and return a list of clean job dicts:
      {title, company, location, description, apply_link, date_posted, skills}
    Returns an empty list on any error.
    """
    url = BASE_URL.format(slug=slug)
    try:
        resp = requests.get(
            url,
            params={"content": "true"},   # include job description HTML
            headers=_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.warning(f"[Greenhouse] No board found for slug '{slug}' (404)")
        else:
            logger.error(f"[Greenhouse] HTTP error for '{slug}': {e}")
        return []
    except Exception as e:
        logger.error(f"[Greenhouse] Request failed for '{slug}': {e}")
        return []

    raw_jobs = data.get("jobs", [])
    if not raw_jobs:
        logger.info(f"[Greenhouse] 0 jobs returned for '{slug}'")
        return []

    results = []
    for job in raw_jobs:
        title = (job.get("title") or "").strip()
        if not title:
            continue

        location = (job.get("location") or {}).get("name") or ""

        # description comes back as HTML when ?content=true is used
        desc_html = (job.get("content") or "")
        description = _strip_html(desc_html)

        apply_link = job.get("absolute_url") or ""
        if not apply_link:
            job_id = job.get("id")
            apply_link = f"https://boards.greenhouse.io/{slug}/jobs/{job_id}" if job_id else ""

        # Parse ISO date
        date_posted: datetime | None = None
        updated_at = job.get("updated_at") or ""
        if updated_at:
            try:
                date_posted = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            except Exception:
                pass

        # Basic skill extraction from description
        from app.services.scraper.nlp_extractor import _extract_skills
        skills = _extract_skills(description) if description else []

        results.append({
            "title":       title,
            "company":     display_name,
            "location":    location or "Not specified",
            "description": description,
            "apply_link":  apply_link,
            "date_posted": date_posted,
            "skills":      skills,
        })

    logger.info(f"[Greenhouse] '{slug}' → {len(results)} jobs")
    return results


def fetch_all_greenhouse_jobs(
    slugs: list[str] | None = None,
    delay: float = 1.5,
) -> list[dict]:
    """
    Fetch jobs from all (or a subset of) Greenhouse companies.
    *delay* seconds between requests to be polite.
    """
    targets = slugs if slugs else list(GREENHOUSE_COMPANIES.keys())
    all_jobs: list[dict] = []

    for slug in targets:
        display = GREENHOUSE_COMPANIES.get(slug, slug.title())
        jobs = fetch_greenhouse_jobs(slug, display)
        all_jobs.extend(jobs)
        time.sleep(delay)

    return all_jobs
