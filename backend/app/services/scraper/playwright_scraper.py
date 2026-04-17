"""Playwright-based scraper for JavaScript-heavy career pages."""

import logging
import asyncio
import threading
import re
from urllib.parse import urljoin, urlparse

from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)


def _resolve_href(href: str, base_url: str) -> str:
    """Resolve a relative or absolute href to a full URL."""
    if not href:
        return base_url
    href = href.strip()
    if href.startswith("http"):
        return href
    try:
        return urljoin(base_url, href)
    except Exception:
        return href


def _clean_title(raw: str) -> str:
    """
    Strip common garbage from an extracted title string.
    Returns empty string if the result doesn't look like a job title.
    """
    if not raw:
        return ""
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", raw)
    # Remove JSON-like fragments
    text = re.sub(r'["\{\}\[\]]', " ", text)
    text = re.sub(r"\btype\s*:\s*\w+", " ", text)
    # Normalise whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Reject if too short, too long, or looks like a code fragment
    if len(text) < 3 or len(text) > 200:
        return ""
    if any(c in text for c in ("=>", "->", "&&", "||", "function", "const ", "var ")):
        return ""
    return text


def _is_valid_title(title: str) -> bool:
    """Return True if the string looks like a real job title."""
    if not title or len(title) < 3:
        return False
    # Must contain at least one letter
    if not re.search(r"[A-Za-z]", title):
        return False
    # Reject obvious JSON/code artifacts
    bad_patterns = [
        r"^\s*[\{\[\(]",
        r'"[a-z]+"\s*:',
        r"\\u[0-9a-f]{4}",
        r"\bfunction\b",
        r"\bnull\b",
        r"\bundefined\b",
    ]
    for pat in bad_patterns:
        if re.search(pat, title, re.IGNORECASE):
            return False
    return True


class PlaywrightScraper(BaseScraper):
    """Scraper using Playwright for JS-rendered career pages."""

    # ------------------------------------------------------------------ #
    # BaseScraper interface (returns RawContent for NLP pipeline)
    # ------------------------------------------------------------------ #

    def scrape(self, url: str, config: dict = None) -> list[RawContent]:
        config = config or {}
        result: list[RawContent] = []
        exc_holder: list[Exception] = []

        def _run():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result.extend(loop.run_until_complete(self._async_scrape(url, config)))
            except Exception as e:
                exc_holder.append(e)
            finally:
                loop.close()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=120)
        if exc_holder:
            logger.error(f"PlaywrightScraper.scrape error for {url}: {exc_holder[0]}")
        return result

    # ------------------------------------------------------------------ #
    # NEW: structured DOM extraction — returns list[dict]
    # ------------------------------------------------------------------ #

    def scrape_with_selectors(self, url: str, config: dict) -> list[dict]:
        """
        Navigate to *url*, render the page, then extract a list of clean job
        dicts  {title, link, location}  directly from DOM using the CSS
        selectors provided in *config['job_selectors']*.

        Falls back to an empty list on any error.
        """
        result: list[dict] = []
        exc_holder: list[Exception] = []

        def _run():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result.extend(
                    loop.run_until_complete(self._async_structured(url, config))
                )
            except Exception as e:
                exc_holder.append(e)
            finally:
                loop.close()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=180)
        if exc_holder:
            logger.error(f"PlaywrightScraper.scrape_with_selectors error for {url}: {exc_holder[0]}")
        return result

    # ------------------------------------------------------------------ #
    # Async internals
    # ------------------------------------------------------------------ #

    async def _async_scrape(self, url: str, config: dict) -> list[RawContent]:
        """Render page and return raw HTML + text for downstream NLP."""
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("playwright not installed — run: pip install playwright && playwright install chromium")
            return []

        wait_selector: str = config.get("wait_for", "")
        wait_time: int = config.get("wait_time", 15)
        scroll: bool = config.get("scroll", True)
        max_scrolls: int = config.get("max_scrolls", 3)
        job_link_pattern: str = config.get("job_link_pattern", "")

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox",
                      "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1920, "height": 1080},
            )
            page = await context.new_page()
            await page.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
            )

            results: list[RawContent] = []
            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)
                if wait_selector:
                    for sel in [s.strip() for s in wait_selector.split(",")]:
                        try:
                            await page.wait_for_selector(sel, timeout=wait_time * 1000)
                            break
                        except Exception:
                            continue
                if scroll:
                    for _ in range(max_scrolls):
                        await page.evaluate("window.scrollTo(0,document.body.scrollHeight)")
                        await asyncio.sleep(1.5)

                html = await page.content()
                text = await page.evaluate("document.body.innerText")
                title = await page.title()

                links: list[str] = []
                if job_link_pattern:
                    try:
                        hrefs = await page.evaluate(
                            f"[...document.querySelectorAll('a')].map(a=>a.href)"
                            f".filter(h=>h&&h.includes('{job_link_pattern}'))"
                        )
                        links = list(set(hrefs))
                    except Exception:
                        pass

                results.append(RawContent(
                    url=url, html=html, text=text[:60000], title=title,
                    links=links, metadata={}, scraped_at=None, engine="playwright",
                ))
            except Exception as e:
                logger.error(f"Playwright page error for {url}: {e}")
            finally:
                await browser.close()

            return results

    async def _async_structured(self, url: str, config: dict) -> list[dict]:
        """
        Render page, then use JS to extract job rows directly from DOM elements.
        Returns a list of clean {title, link, location} dicts.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("playwright not installed")
            return []

        selectors: dict = config.get("job_selectors", {})
        container_sel: str = selectors.get("container", "")
        title_sel: str = selectors.get("title", "a")
        link_sel: str = selectors.get("link", "a")
        location_sel: str = selectors.get("location", "")
        wait_selector: str = config.get("wait_for", container_sel)
        wait_time: int = config.get("wait_time", 20)
        scroll: bool = config.get("scroll", True)
        max_scrolls: int = config.get("max_scrolls", 5)
        max_jobs: int = config.get("max_jobs", 200)

        if not container_sel:
            logger.warning("scrape_with_selectors called without 'container' in job_selectors")
            return []

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox",
                      "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1920, "height": 1080},
            )
            page = await context.new_page()
            await page.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
            )

            raw_jobs: list[dict] = []
            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)

                # Wait for job container
                for sel in [s.strip() for s in wait_selector.split(",")]:
                    try:
                        await page.wait_for_selector(sel, timeout=wait_time * 1000)
                        break
                    except Exception:
                        continue

                # Scroll to reveal lazy-loaded items
                if scroll:
                    for _ in range(max_scrolls):
                        await page.evaluate("window.scrollTo(0,document.body.scrollHeight)")
                        await asyncio.sleep(1.5)

                # Extract structured data from DOM via JavaScript
                raw_jobs = await page.evaluate(
                    """
                    ([containerSel, titleSel, linkSel, locationSel, maxJobs]) => {
                        const tryQuery = (el, selStr) => {
                            for (const s of selStr.split(',')) {
                                const found = el.querySelector(s.trim());
                                if (found) return found;
                            }
                            return null;
                        };

                        const containers = [...document.querySelectorAll(containerSel)];
                        const jobs = [];

                        for (const el of containers) {
                            if (jobs.length >= maxJobs) break;

                            const titleEl = tryQuery(el, titleSel);
                            const linkEl  = tryQuery(el, linkSel);
                            const locEl   = locationSel ? tryQuery(el, locationSel) : null;

                            const title    = (titleEl?.textContent || '').trim().replace(/\\s+/g, ' ');
                            const link     = linkEl?.href || linkEl?.getAttribute('href') || '';
                            const location = (locEl?.textContent   || '').trim().replace(/\\s+/g, ' ');

                            if (title && title.length >= 3 && title.length <= 200) {
                                jobs.push({ title, link, location });
                            }
                        }
                        return jobs;
                    }
                    """,
                    [container_sel, title_sel, link_sel, location_sel, max_jobs],
                )
            except Exception as e:
                logger.error(f"Playwright structured scrape error for {url}: {e}")
            finally:
                await browser.close()

        # Post-process: clean titles, resolve relative links
        clean: list[dict] = []
        seen: set[str] = set()
        for job in (raw_jobs or []):
            title = _clean_title(job.get("title", ""))
            if not _is_valid_title(title):
                continue
            link = _resolve_href(job.get("link", ""), url)
            location = re.sub(r"\s+", " ", job.get("location", "")).strip()
            key = (title.lower(), link)
            if key in seen:
                continue
            seen.add(key)
            clean.append({"title": title, "link": link, "location": location})

        logger.info(f"DOM extraction from {url}: {len(clean)} jobs")
        return clean
