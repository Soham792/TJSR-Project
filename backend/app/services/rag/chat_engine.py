"""Featherless-powered chat engine with RAG context."""

import json
import logging
import redis as redis_lib
from datetime import datetime, timezone
from app.config import get_settings
from app.services.rag.retriever import get_context_for_query, search_similar_jobs

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the official TJSR Assistant, an advanced AI for the Tracker for Job Search and Reporting platform.
You have DIRECT access to the entire platform's real-time data, including job postings, company databases, and the user's personal profile statistics and resume.

When a user asks about jobs, companies, or their own progress:
1. ALWAYS reference the provided 'Current Platform Stats' and 'Context from User's Resume' if relevant.
2. If there are jobs in the context, treat them as real, active postings from our database.
3. NEVER claim that you do not have access to real-time job postings or user statistics.
4. If the context is empty, explain that matches were not found in the current platform database, but offer to help with general career advice or resume tips.

Be professional, concise, and helpful. Use the user's resume data to personalize your advice."""


async def get_chat_response(query: str, user_id: str, session_id: str) -> dict:
    """Get a RAG-powered chat response."""
    settings = get_settings()

    # Retrieve relevant context
    context = await get_context_for_query(query, user_id=user_id, limit=5)
    sources = await search_similar_jobs(query, limit=5)

    # Build conversation history from Redis
    history = _load_history(user_id, session_id)

    # Build messages list for chat completions format
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    for msg in history[-6:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Add user message with RAG context
    user_content = f"Context from job database:\n{context}\n\nUser question: {query}" if context.strip() else query
    messages.append({"role": "user", "content": user_content})

    # Call Featherless
    response_text = await _call_featherless(messages, settings)

    # Save to history
    _save_to_history(user_id, session_id, query, response_text)

    return {
        "response": response_text,
        "sources": [
            {
                "job_id": s["job_id"],
                "title": s["title"],
                "company": s["company"],
                "relevance_score": s["score"],
            }
            for s in sources[:3]
        ],
    }


async def stream_chat_response(query: str, user_id: str, session_id: str):
    """Stream a RAG-powered chat response as SSE chunks."""
    settings = get_settings()

    context = await get_context_for_query(query, user_id=user_id, limit=5)
    history = _load_history(user_id, session_id)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    for msg in history[-6:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    user_content = f"Context from job database:\n{context}\n\nUser question: {query}" if context.strip() else query
    messages.append({"role": "user", "content": user_content})

    full_response = ""

    async for chunk in _stream_featherless(messages, settings):
        full_response += chunk
        yield {"type": "chunk", "content": chunk}

    # Save to history after streaming completes
    _save_to_history(user_id, session_id, query, full_response)

    # Send sources
    sources = await search_similar_jobs(query, limit=3)
    yield {
        "type": "sources",
        "sources": [
            {
                "job_id": s["job_id"],
                "title": s["title"],
                "company": s["company"],
                "relevance_score": s["score"],
            }
            for s in sources
        ],
    }


def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> blocks produced by reasoning models."""
    import re
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


async def _call_featherless(messages: list[dict], settings) -> str:
    """Call Featherless (OpenAI-compatible) chat completions API."""
    import httpx

    if not settings.featherless_api_key:
        return (
            "The AI assistant is not configured yet. "
            "Please set FEATHERLESS_API_KEY in your backend .env file "
            "(get a free key at featherless.ai)."
        )

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.featherless_api_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.featherless_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.featherless_model,
                    "messages": messages,
                    "stream": False,
                    "temperature": 0.3,
                    "max_tokens": 4096,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return _strip_thinking(content)
    except Exception as e:
        logger.error(f"Featherless call failed: {e}")
        return "I'm currently unable to process your request. Please try again later."


async def _stream_featherless(messages: list[dict], settings):
    """Stream response from Featherless (OpenAI-compatible) chat completions API."""
    import httpx

    if not settings.featherless_api_key:
        yield (
            "The AI assistant is not configured yet. "
            "Please set FEATHERLESS_API_KEY in your backend .env file."
        )
        return

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream(
                "POST",
                f"{settings.featherless_api_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.featherless_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.featherless_model,
                    "messages": messages,
                    "stream": True,
                    "temperature": 0.3,
                    "max_tokens": 4096,
                },
            ) as resp:
                inside_think = False
                buffer = ""
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    raw = line[6:]
                    if raw.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(raw)
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if not content:
                            continue

                        # Strip <think>...</think> blocks inline
                        buffer += content
                        while True:
                            if inside_think:
                                end = buffer.find("</think>")
                                if end == -1:
                                    buffer = ""
                                    break
                                buffer = buffer[end + 8:]
                                inside_think = False
                            else:
                                start = buffer.find("<think>")
                                if start == -1:
                                    yield buffer
                                    buffer = ""
                                    break
                                if start > 0:
                                    yield buffer[:start]
                                buffer = buffer[start + 7:]
                                inside_think = True
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except Exception as e:
        logger.error(f"Featherless stream failed: {e}")
        yield "Error: Could not stream response."


def _load_history(user_id: str, session_id: str) -> list[dict]:
    """Load chat history from Redis."""
    try:
        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url)
        key = f"chat:history:{user_id}:{session_id}"
        history = r.lrange(key, 0, -1)
        r.close()
        return [json.loads(h) for h in history]
    except Exception:
        return []


def _save_to_history(user_id: str, session_id: str, user_msg: str, assistant_msg: str):
    """Save messages to chat history in Redis."""
    try:
        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url)
        key = f"chat:history:{user_id}:{session_id}"
        ts = datetime.now(timezone.utc).isoformat()
        r.rpush(key, json.dumps({"role": "user", "content": user_msg, "timestamp": ts}))
        r.rpush(key, json.dumps({"role": "assistant", "content": assistant_msg, "timestamp": ts}))
        r.expire(key, 86400 * 7)  # 7 days TTL
        r.close()
    except Exception as e:
        logger.warning(f"Could not save chat history: {e}")
