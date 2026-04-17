from fastapi import APIRouter, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse
import uuid
import json
import logging
from app.services.telegram.notifications import send_chatbot_message, create_db_notification

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(
    data: ChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a chat message and get a RAG-powered response."""
    from app.services.rag.chat_engine import get_chat_response

    session_id = data.session_id or str(uuid.uuid4())

    result = await get_chat_response(
        query=data.message,
        user_id=user.id,
        session_id=session_id,
    )

    # Background tasks for notifications
    background_tasks.add_task(send_chatbot_message, user.id, data.message, result["response"])
    background_tasks.add_task(
        create_db_notification,
        user.id,
        "chatbot",
        "AI Assistant Response",
        f"The AI finished its response to: {data.message[:50]}..."
    )

    return ChatResponse(
        message=result["response"],
        sources=result.get("sources", []),
        session_id=session_id,
    )


@router.post("/stream")
async def chat_stream(
    data: ChatRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """Stream a chat response via SSE."""
    from app.services.rag.chat_engine import stream_chat_response

    session_id = data.session_id or str(uuid.uuid4())

    async def event_generator():
        full_text = ""
        async for chunk in stream_chat_response(
            query=data.message,
            user_id=user.id,
            session_id=session_id,
        ):
            if chunk.get("type") == "chunk":
                full_text += chunk.get("content", "")
            yield f"data: {json.dumps(chunk)}\n\n"
        
        # Background tasks after stream finishes
        if full_text:
            background_tasks.add_task(send_chatbot_message, user.id, data.message, full_text)
            background_tasks.add_task(
                create_db_notification,
                user.id,
                "chatbot",
                "AI Assistant Response",
                f"The AI finished its response to: {data.message[:50]}..."
            )
            
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/history")
async def chat_history(
    session_id: str | None = None,
    user: User = Depends(get_current_user),
):
    """Get chat history for a session."""
    import redis as redis_lib
    from app.config import get_settings
    settings = get_settings()

    r = redis_lib.from_url(settings.redis_url)
    key = f"chat:history:{user.id}:{session_id}" if session_id else f"chat:history:{user.id}:*"

    if session_id:
        history = r.lrange(key, 0, -1)
        r.close()
        return [json.loads(h) for h in history]
    else:
        # List all sessions
        keys = r.keys(f"chat:history:{user.id}:*")
        sessions = [k.decode().split(":")[-1] for k in keys]
        r.close()
        return {"sessions": sessions}


@router.delete("/history")
async def clear_history(
    session_id: str | None = None,
    user: User = Depends(get_current_user),
):
    """Clear chat history."""
    import redis as redis_lib
    from app.config import get_settings
    settings = get_settings()

    r = redis_lib.from_url(settings.redis_url)
    if session_id:
        r.delete(f"chat:history:{user.id}:{session_id}")
    else:
        keys = r.keys(f"chat:history:{user.id}:*")
        for key in keys:
            r.delete(key)
    r.close()

    return {"message": "History cleared"}
