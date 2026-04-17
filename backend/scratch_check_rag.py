import asyncio
import os
import sys

# Add the backend directory to sys.path to import app modules
sys.path.append(os.path.abspath("."))

from app.models.database import engine
from app.models.job import Job
from sqlalchemy import select, func
from app.services.rag.indexer import get_qdrant_client, JOB_COLLECTION

async def check():
    print("--- Database Check ---")
    try:
        async with engine.begin() as conn:
            res = await conn.execute(select(func.count(Job.id)))
            count = res.scalar()
            print(f"Job count in DB: {count}")
    except Exception as e:
        print(f"DB Error: {e}")

    print("\n--- Qdrant Check ---")
    try:
        client = get_qdrant_client()
        if not client:
            print("Qdrant client could not be initialized.")
        else:
            collections = client.get_collections()
            print(f"Collections: {[c.name for c in collections.collections]}")
            
            if JOB_COLLECTION in [c.name for c in collections.collections]:
                collection_info = client.get_collection(JOB_COLLECTION)
                print(f"Jobs in Qdrant: {collection_info.points_count}")
            else:
                print(f"Collection '{JOB_COLLECTION}' does not exist.")
            client.close()
    except Exception as e:
        print(f"Qdrant Error: {e}")

if __name__ == "__main__":
    asyncio.run(check())
