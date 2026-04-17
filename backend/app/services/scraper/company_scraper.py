"""
Company-specific scraper using hardcoded official career page URLs.

Scraping flow (structured path — preferred):
  CompanyScraper.run()
    → _scrape_company()
        → PlaywrightScraper.scrape_with_selectors()   ← CSS-selector DOM extraction
        → [{"title": ..., "link": ..., "location": ...}]
        → Job(title=..., company=source_name, ...)     ← company always from config

Fallback (NLP path — when no job_selectors provided):
  → PlaywrightScraper.scrape() / BS4Scraper.scrape()
  → extract_jobs_from_content()
"""

import json
import logging
import re
import time
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.job import Job

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Official company career page configs
# ---------------------------------------------------------------------------
# Each entry may carry  job_selectors  → used for direct DOM extraction.
#   container : CSS selector that matches one element per job listing row/card
#   title     : CSS selector (inside container) for the job title element
#   link      : CSS selector (inside container) for the <a> element
#   location  : CSS selector (inside container) for the location element
#
# All selectors accept comma-separated alternatives; the first match is used.
# ---------------------------------------------------------------------------

COMPANY_SOURCES: list[dict] = [
    # ── Big Tech ────────────────────────────────────────────────────────────
    {
        "name": "Google",
        "url": "https://careers.google.com/jobs/results/",
        "engine": "google_careers",
        "config": {"max_pages": 3, "max_jobs": 100},
    },
    {
        "name": "Apple",
        "url": "https://jobs.apple.com/en-in/search",
        "engine": "playwright",
        "config": {
            "wait_for": "table.table--advanced-search, tbody tr",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "table tbody tr, .table-row",
                "title":    "td:first-child a, .table-col-1 a, a[href*='/en-in/details/']",
                "link":     "td:first-child a, .table-col-1 a, a[href*='/en-in/details/']",
                "location": "td:nth-child(2), .table-col-2",
            },
        },
    },
    {
        "name": "Microsoft",
        "url": "https://careers.microsoft.com/us/en/search-results",
        "engine": "playwright",
        "config": {
            "wait_for": ".ms-List-cell, [data-automationid='ListCell'], li[class*='listItem']",
            "wait_time": 25,
            "scroll": True,
            "max_scrolls": 8,
            "max_jobs": 200,
            "job_selectors": {
                "container": ".ms-List-cell, [data-automationid='ListCell'], li[class*='JobCard']",
                "title":    "a[href*='/job/'], a[target='_blank'], h2 a, h3 a",
                "link":     "a[href*='/job/'], a[target='_blank']",
                "location": "[class*='subtitle'], [class*='location'], span:nth-child(2)",
            },
        },
    },
    {
        "name": "Amazon",
        "url": "https://www.amazon.jobs/en/search",
        "engine": "playwright",
        "config": {
            "wait_for": ".job-tile, .job-card-module",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": ".job-tile, .job-card-module",
                "title":    ".job-title a, h3 a, a[href*='/jobs/']",
                "link":     ".job-title a, h3 a, a[href*='/jobs/']",
                "location": ".location, .job-location, [class*='location']",
            },
        },
    },
    {
        "name": "Meta",
        "url": "https://careers.meta.com/jobs/",
        "engine": "playwright",
        "config": {
            "wait_for": "[data-testid='job-item'], a[href*='/jobs/'], div[class*='JobCard']",
            "wait_time": 25,
            "scroll": True,
            "max_scrolls": 8,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[data-testid='job-item'], div[class*='JobCard'], li[class*='job']",
                "title":    "a[href*='/jobs/'], h3, h4, [class*='title']",
                "link":     "a[href*='/jobs/']",
                "location": "[class*='location'], [class*='subtitle'], span:nth-child(2)",
            },
        },
    },
    {
        "name": "Netflix",
        "url": "https://api.lever.co/v0/postings/netflix",
        "engine": "lever",
        "config": {"slug": "netflix"},
    },
    {
        "name": "IBM",
        "url": "https://careers.ibm.com/job/search",
        "engine": "playwright",
        "config": {
            "wait_for": ".bx--data-table tbody tr, [class*='JobCard'], [class*='job-card']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": ".bx--data-table tbody tr, [class*='JobCard'], [class*='job-card']",
                "title":    "a[href*='/job/'], td:first-child a, [class*='title'] a",
                "link":     "a[href*='/job/'], td:first-child a",
                "location": "td:nth-child(3), [class*='location'], td:nth-child(2)",
            },
        },
    },
    {
        "name": "Oracle",
        "url": "https://careers.oracle.com/jobs",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job-row'], [class*='JobCard'], li[class*='job']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-row'], [class*='JobCard'], li[class*='job'], tr[class*='job']",
                "title":    "a[href*='/job/'], [class*='title'] a, td:first-child a",
                "link":     "a[href*='/job/'], td:first-child a",
                "location": "[class*='location'], td:nth-child(2)",
            },
        },
    },
    {
        "name": "Intel",
        "url": "https://jobs.intel.com/en/search-jobs",
        "engine": "playwright",
        "config": {
            "wait_for": ".job-list-item, [class*='JobCard'], [class*='job-item']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": ".job-list-item, [class*='JobCard'], li[class*='job']",
                "title":    "a[href*='/job/'], h3 a, [class*='title'] a",
                "link":     "a[href*='/job/']",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    {
        "name": "Adobe",
        "url": "https://careers.adobe.com/us/en/search-results",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job-tile'], [data-automation-id*='job'], [class*='JobCard']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-tile'], [data-automation-id*='job'], li[class*='job']",
                "title":    "a[href*='/job/'], [class*='title'] a, h3 a",
                "link":     "a[href*='/job/']",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    # ── Indian IT / Service companies ───────────────────────────────────────
    {
        "name": "Infosys",
        "url": "https://careers.infosys.com/",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='vacancy'], [class*='openings']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-card'], [class*='vacancy-card'], [class*='opening'], li[class*='job']",
                "title":    "a, h3, h4, [class*='title']",
                "link":     "a",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    {
        "name": "TCS",
        "url": "https://www.tcs.com/careers/tcs-careers-global-listing",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='career'], table tbody tr",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "table tbody tr, [class*='job-card'], li[class*='job']",
                "title":    "a, td:first-child, [class*='title']",
                "link":     "a",
                "location": "td:nth-child(2), [class*='location']",
            },
        },
    },
    {
        "name": "Wipro",
        "url": "https://careers.wipro.com/careers-home/jobs",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='opening'], [class*='card']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-card'], [class*='opening'], li[class*='job']",
                "title":    "a, h3, [class*='title']",
                "link":     "a",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    {
        "name": "HCL Tech",
        "url": "https://careers.hcltech.com/",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='career'], [class*='card']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-card'], [class*='career-card'], li[class*='job']",
                "title":    "a, h3, h4, [class*='title']",
                "link":     "a",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    {
        "name": "Tech Mahindra",
        "url": "https://jobs.techmahindra.com/",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='position'], table tbody tr",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "table tbody tr, [class*='job-row'], li[class*='job']",
                "title":    "a, td:first-child, [class*='title']",
                "link":     "a",
                "location": "td:nth-child(2), [class*='location']",
            },
        },
    },
    {
        "name": "Accenture",
        "url": "https://www.accenture.com/in-en/careers/jobsearch",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='position'], [class*='card']",
            "wait_time": 25,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-card'], [class*='position-card'], li[class*='job']",
                "title":    "a, h3, [class*='title']",
                "link":     "a",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    {
        "name": "Cognizant",
        "url": "https://careers.cognizant.com/global/en",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='card'], table tbody tr",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-card'], table tbody tr, li[class*='job']",
                "title":    "a, td:first-child, [class*='title']",
                "link":     "a",
                "location": "td:nth-child(2), [class*='location']",
            },
        },
    },
    {
        "name": "Capgemini",
        "url": "https://www.capgemini.com/careers/",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='position'], [class*='card']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-card'], [class*='position'], li[class*='job']",
                "title":    "a, h3, [class*='title']",
                "link":     "a",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    # ── Indian startups / e-commerce ───────────────────────────────────────
    {
        "name": "Flipkart",
        "url": "https://careers.flipkart.com/",
        "engine": "playwright",
        "config": {
            "wait_for": "[class*='job'], [class*='opening'], [class*='card']",
            "wait_time": 20,
            "scroll": True,
            "max_scrolls": 5,
            "max_jobs": 200,
            "job_selectors": {
                "container": "[class*='job-card'], [class*='opening'], li[class*='job']",
                "title":    "a, h3, [class*='title']",
                "link":     "a",
                "location": "[class*='location'], [class*='city']",
            },
        },
    },
    {
        "name": "Zomato",
        "url": "https://api.lever.co/v0/postings/zomato",
        "engine": "lever",
        "config": {"slug": "zomato"},
    },
    {
        "name": "Swiggy",
        "url": "https://api.lever.co/v0/postings/swiggy",
        "engine": "lever",
        "config": {"slug": "swiggy"},
    },
    # ── Greenhouse API companies (no browser needed — pure JSON API) ────────
    {"name": "Stripe",    "url": "https://boards-api.greenhouse.io/v1/boards/stripe/jobs",    "engine": "greenhouse", "config": {"slug": "stripe"}},
    {"name": "Airbnb",    "url": "https://boards-api.greenhouse.io/v1/boards/airbnb/jobs",    "engine": "greenhouse", "config": {"slug": "airbnb"}},
    {"name": "Shopify",   "url": "https://boards-api.greenhouse.io/v1/boards/shopify/jobs",   "engine": "greenhouse", "config": {"slug": "shopify"}},
    {"name": "Notion",    "url": "https://boards-api.greenhouse.io/v1/boards/notion/jobs",    "engine": "greenhouse", "config": {"slug": "notion"}},
    {"name": "Discord",   "url": "https://boards-api.greenhouse.io/v1/boards/discord/jobs",   "engine": "greenhouse", "config": {"slug": "discord"}},
    {"name": "Robinhood", "url": "https://boards-api.greenhouse.io/v1/boards/robinhood/jobs", "engine": "greenhouse", "config": {"slug": "robinhood"}},
    {"name": "Coinbase",  "url": "https://boards-api.greenhouse.io/v1/boards/coinbase/jobs",  "engine": "greenhouse", "config": {"slug": "coinbase"}},
    {"name": "Dropbox",   "url": "https://boards-api.greenhouse.io/v1/boards/dropbox/jobs",   "engine": "greenhouse", "config": {"slug": "dropbox"}},
    {"name": "Intercom",  "url": "https://boards-api.greenhouse.io/v1/boards/intercom/jobs",  "engine": "greenhouse", "config": {"slug": "intercom"}},
    {"name": "Figma",     "url": "https://boards-api.greenhouse.io/v1/boards/figma/jobs",     "engine": "greenhouse", "config": {"slug": "figma"}},
]

COMPANY_MAP: dict[str, dict] = {s["name"]: s for s in COMPANY_SOURCES}
COMPANY_NAMES: list[str] = [s["name"] for s in COMPANY_SOURCES]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean_text(raw: str) -> str:
    """Remove HTML tags, JSON fragments, and normalise whitespace."""
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r'["\{\}\[\]]', " ", text)
    text = re.sub(r"\btype\s*:\s*\w+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _is_valid_title(title: str) -> bool:
    if not title or len(title) < 3 or len(title) > 200:
        return False
    if not re.search(r"[A-Za-z]", title):
        return False
    for pat in (r'"[a-z]+"\s*:', r"\\u[0-9a-f]{4}", r"\bfunction\b",
                r"\bnull\b", r"\bundefined\b", r"^\s*[\{\[\(]"):
        if re.search(pat, title, re.IGNORECASE):
            return False
    # Reject Workday/ATS internal IDs: starts with 8+ hex chars
    # (e.g. 654c6aaa25ad4751986d2b4fdcf3da6f-b7d405fc-078f-42fd-99cf-e21de3479349-7421)
    if re.match(r'^[0-9a-f]{8,}', title, re.IGNORECASE):
        return False
    # Reject if majority of content is hex segments with no real words
    hex_segments = re.findall(r'[0-9a-f]{4,}', title, re.IGNORECASE)
    alpha_words = re.findall(r'[A-Za-z]{2,}', title)
    if len(hex_segments) >= 3 and len(alpha_words) == 0:
        return False
    return True


# ---------------------------------------------------------------------------
# Main scraper class
# ---------------------------------------------------------------------------

class CompanyScraper:
    """
    Orchestrates scraping of all hardcoded company career pages.
    Saves results directly to the PostgreSQL jobs table.
    """

    def __init__(self):
        settings = get_settings()
        self.sync_engine = create_engine(settings.sync_database_url)

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def run(self, company_names: list[str] | None = None) -> dict:
        sources = COMPANY_SOURCES
        if company_names:
            sources = [s for s in COMPANY_SOURCES if s["name"] in company_names]

        result: dict = {
            "jobs_found": 0,
            "sources_completed": 0,
            "sources_total": len(sources),
            "errors": [],
            "companies": [],
        }

        for i, source in enumerate(sources):
            name = source["name"]
            self._publish_progress({
                "progress": int(i / len(sources) * 100),
                "jobs_found": result["jobs_found"],
                "sources_completed": i,
                "sources_total": len(sources),
                "current_source": name,
                "is_running": True,
            })

            try:
                logger.info(f"[CompanyScraper] Scraping {name}: {source['url']}")
                t0 = time.time()
                jobs = self._scrape_company(source)
                elapsed = round(time.time() - t0, 1)

                result["jobs_found"] += len(jobs)
                result["sources_completed"] += 1
                result["companies"].append(
                    {"name": name, "jobs": len(jobs), "elapsed_s": elapsed, "status": "success"}
                )
                logger.info(f"[CompanyScraper]   → {len(jobs)} new jobs ({elapsed}s)")

            except Exception as e:
                msg = f"{name}: {e}"
                logger.error(f"[CompanyScraper] Error on {name}: {e}")
                result["errors"].append(msg)
                result["companies"].append(
                    {"name": name, "jobs": 0, "elapsed_s": 0, "status": "failed", "error": str(e)}
                )

            time.sleep(2)  # polite delay

        self._publish_progress({
            "progress": 100,
            "jobs_found": result["jobs_found"],
            "sources_completed": result["sources_completed"],
            "sources_total": result["sources_total"],
            "current_source": None,
            "is_running": False,
        })

        return result

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _scrape_company(self, source: dict) -> list[Job]:
        """Scrape one company; return list of newly-created Job rows."""
        engine_name = source["engine"]
        url = source["url"]
        config = source.get("config", {})
        company_name = source["name"]

        # ── Greenhouse JSON API (fastest, most reliable) ───────────────
        if engine_name == "greenhouse":
            return self._scrape_greenhouse(source)

        # ── Lever JSON API (fast, no browser needed) ────────────────────
        if engine_name == "lever":
            return self._scrape_lever(source)

        # ── Google: use its dedicated scraper ──────────────────────────
        if engine_name == "google_careers":
            from app.services.scraper.google_careers_scraper import GoogleCareersScraper
            raw_contents = GoogleCareersScraper().scrape(url, config)
            return self._persist_from_raw(raw_contents, company_name, url)

        # ── Playwright structured path (preferred) ─────────────────────
        if config.get("job_selectors"):
            try:
                from app.services.scraper.playwright_scraper import PlaywrightScraper
                structured = PlaywrightScraper().scrape_with_selectors(url, config)
                if structured:
                    return self._persist_structured(structured, company_name, url)
                logger.warning(f"[CompanyScraper] Structured extraction returned 0 jobs for {company_name}, falling back")
            except Exception as e:
                logger.warning(f"[CompanyScraper] Structured path failed for {company_name}: {e}")

        # ── Fallback: render page → NLP extractor ──────────────────────
        raw_contents = []
        try:
            from app.services.scraper.playwright_scraper import PlaywrightScraper
            raw_contents = PlaywrightScraper().scrape(url, config)
        except Exception as e:
            logger.warning(f"[CompanyScraper] Playwright fallback failed for {company_name}: {e}")

        if not raw_contents:
            from app.services.scraper.bs4_scraper import BS4Scraper
            try:
                raw_contents = BS4Scraper().scrape(url, {})
            except Exception as e:
                logger.warning(f"[CompanyScraper] BS4 fallback failed for {company_name}: {e}")

        return self._persist_from_raw(raw_contents, company_name, url)

    def _scrape_greenhouse(self, source: dict) -> list[Job]:
        """Call Greenhouse JSON API and persist results — no browser required."""
        from app.services.scraper.greenhouse_scraper import fetch_greenhouse_jobs

        slug         = source["config"]["slug"]
        company_name = source["name"]
        source_url   = source["url"]

        job_dicts = fetch_greenhouse_jobs(slug, company_name)
        if not job_dicts:
            return []

        jobs_created: list[Job] = []
        with Session(self.sync_engine) as session:
            for item in job_dicts:
                title = item.get("title", "").strip()
                if not _is_valid_title(title):
                    continue

                apply_link = item.get("apply_link") or source_url
                location   = item.get("location") or "Not specified"
                description = item.get("description") or ""
                skills     = item.get("skills") or []
                date_posted = item.get("date_posted")  # datetime | None

                # Dedup: same title + company
                exists = session.execute(
                    select(Job).where(
                        Job.title   == title,
                        Job.company == company_name,
                    )
                ).scalar_one_or_none()
                if exists:
                    continue

                job = Job(
                    title=title,
                    company=company_name,
                    location=location,
                    description=description[:5000],
                    skills=skills,
                    job_type="Full-time",
                    apply_link=apply_link,
                    source_url=source_url,
                    source_name=company_name,
                    date_posted=date_posted,
                    raw_content=description[:10000],
                )
                session.add(job)
                jobs_created.append(job)

            session.flush()
            self._queue_pipelines(jobs_created)
            session.commit()

        logger.info(f"[Greenhouse] Saved {len(jobs_created)} new jobs for {company_name}")
        return jobs_created

    def _scrape_lever(self, source: dict) -> list[Job]:
        """Call Lever JSON API and persist results — no browser required."""
        from app.services.scraper.lever_scraper import fetch_lever_jobs

        slug         = source["config"]["slug"]
        company_name = source["name"]
        source_url   = source["url"]

        job_dicts = fetch_lever_jobs(slug, company_name)
        if not job_dicts:
            return []

        jobs_created: list[Job] = []
        with Session(self.sync_engine) as session:
            for item in job_dicts:
                title = item.get("title", "").strip()
                if not _is_valid_title(title):
                    continue

                apply_link  = item.get("apply_link") or source_url
                location    = item.get("location") or "Not specified"
                description = item.get("description") or ""
                skills      = item.get("skills") or []
                job_type    = item.get("job_type") or "Full-time"
                date_posted = item.get("date_posted")

                exists = session.execute(
                    select(Job).where(
                        Job.title   == title,
                        Job.company == company_name,
                    )
                ).scalar_one_or_none()
                if exists:
                    continue

                job = Job(
                    title=title,
                    company=company_name,
                    location=location,
                    description=description[:5000],
                    skills=skills,
                    job_type=job_type,
                    apply_link=apply_link,
                    source_url=source_url,
                    source_name=company_name,
                    date_posted=date_posted,
                    raw_content=description[:10000],
                )
                session.add(job)
                jobs_created.append(job)

            session.flush()
            self._queue_pipelines(jobs_created)
            session.commit()

        logger.info(f"[Lever] Saved {len(jobs_created)} new jobs for {company_name}")
        return jobs_created

    def _persist_structured(self, structured: list[dict], company_name: str, source_url: str) -> list[Job]:
        """
        Persist a list of {title, link, location} dicts as Job rows.
        Company name is ALWAYS taken from the source config — never from scraped text.
        """
        jobs_created: list[Job] = []

        with Session(self.sync_engine) as session:
            for item in structured:
                title = _clean_text(item.get("title", ""))
                if not _is_valid_title(title):
                    continue

                link = item.get("link") or source_url
                location = _clean_text(item.get("location", "")) or "Not specified"

                # Dedup: same title + company
                exists = session.execute(
                    select(Job).where(
                        Job.title == title,
                        Job.company == company_name,
                    )
                ).scalar_one_or_none()
                if exists:
                    continue

                job = Job(
                    title=title,
                    company=company_name,        # ← always from config
                    location=location,
                    description="",
                    skills=[],
                    job_type="Full-time",
                    apply_link=link,
                    source_url=source_url,
                    source_name=company_name,
                    raw_content="",
                )
                session.add(job)
                jobs_created.append(job)

            session.flush()
            self._queue_pipelines(jobs_created)
            session.commit()

        return jobs_created

    def _persist_from_raw(self, raw_contents, company_name: str, source_url: str) -> list[Job]:
        """
        NLP-based extraction path. Always overrides company with source name.
        Validates titles to skip garbage.
        """
        from app.services.scraper.nlp_extractor import extract_jobs_from_content

        if not raw_contents:
            return []

        jobs_created: list[Job] = []

        with Session(self.sync_engine) as session:
            for content in raw_contents:
                extracted = extract_jobs_from_content(
                    text=content.text,
                    url=content.url,
                    html=content.html,
                    metadata=content.metadata,
                )

                for job_data in extracted:
                    title = _clean_text(job_data.title)
                    if not _is_valid_title(title):
                        continue

                    apply_link = job_data.apply_link or source_url
                    location = _clean_text(job_data.location) or "Not specified"

                    exists = session.execute(
                        select(Job).where(
                            Job.title == title,
                            Job.company == company_name,
                        )
                    ).scalar_one_or_none()
                    if exists:
                        continue

                    job = Job(
                        title=title,
                        company=company_name,    # ← always from config
                        location=location,
                        description=_clean_text(job_data.description or "")[:5000],
                        skills=job_data.skills or [],
                        job_type=job_data.job_type or "Full-time",
                        salary=job_data.salary or "",
                        apply_link=apply_link,
                        source_url=content.url or source_url,
                        source_name=company_name,
                        raw_content=(content.text or "")[:10000],
                    )
                    session.add(job)
                    jobs_created.append(job)

            session.flush()
            self._queue_pipelines(jobs_created)
            session.commit()

        return jobs_created

    def _queue_pipelines(self, jobs: list[Job]) -> None:
        from app.workers.tasks import process_job_pipeline
        for job in jobs:
            try:
                process_job_pipeline.delay(str(job.id))
            except Exception as e:
                logger.warning(f"[CompanyScraper] Could not queue pipeline for {job.id}: {e}")

    def _publish_progress(self, data: dict) -> None:
        try:
            import redis
            settings = get_settings()
            url = settings.redis_url
            # Disable TLS cert verification for Upstash (rediss://) and plain redis://
            # Added socket_timeout and socket_connect_timeout to prevent hanging the scraper thread
            r = redis.from_url(
                url, 
                ssl_cert_reqs="none",
                socket_timeout=5,
                socket_connect_timeout=5
            ) if url.startswith("rediss://") else redis.from_url(
                url,
                socket_timeout=5,
                socket_connect_timeout=5
            )
            r.set("company_scraper:status", json.dumps(data), ex=7200)
            r.publish("company_scraper:events", json.dumps(data))
            r.close()
        except Exception as e:
            logger.warning(f"[CompanyScraper] Redis publish failed (non-fatal): {e}")
