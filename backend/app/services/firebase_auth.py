import firebase_admin
from firebase_admin import auth as firebase_auth, credentials, storage as firebase_storage
from app.config import get_settings
from datetime import datetime, timedelta
import os
import logging

logger = logging.getLogger(__name__)

_firebase_app = None

def init_firebase():
    global _firebase_app
    if _firebase_app:
        return _firebase_app

    settings = get_settings()
    cred_path = settings.firebase_service_account_key

    options = {
        "storageBucket": settings.firebase_storage_bucket
    }

    try:
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            _firebase_app = firebase_admin.initialize_app(cred, options)
            logger.info(f"Firebase initialized with Storage: {settings.firebase_storage_bucket}")
        elif settings.firebase_project_id:
            options["projectId"] = settings.firebase_project_id
            _firebase_app = firebase_admin.initialize_app(options=options)
            logger.info(f"Firebase initialized with project ID: {settings.firebase_project_id}")
        else:
            _firebase_app = firebase_admin.initialize_app(options=options)
            logger.info("Firebase initialized with defaults")
    except ValueError:
        # App already exists, just get it
        _firebase_app = firebase_admin.get_app()
        logger.info("Using existing Firebase app instance")
    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        _firebase_app = None

    return _firebase_app

def upload_file_to_storage(user_id: str, filename: str, content: bytes, content_type: str = "application/pdf") -> str:
    """Uploads file to Firebase Storage and returns a long-lived signed URL."""
    if not _firebase_app:
        init_firebase()
    
    try:
        bucket = firebase_storage.bucket()
        path = f"resumes/{user_id}/{filename}"
        blob = bucket.blob(path)
        blob.upload_from_string(content, content_type=content_type)
        
        # Using a long-lived signed URL (50 years) to ensure permanence and bypass CORS/Public access issues
        # Note: Expiration can be a timedelta or a datetime
        url = blob.generate_signed_url(expiration=timedelta(days=365*50), version="v4")
        logger.info(f"Successfully uploaded {filename} for user {user_id}. URL generated.")
        return url
    except Exception as e:
        logger.error(f"Failed to upload file to storage: {e}")
        return ""

async def verify_firebase_token(id_token: str) -> dict | None:
    """Verify a Firebase ID token and return the decoded claims."""
    if not _firebase_app:
        init_firebase()

    if not _firebase_app:
        logger.warning("Firebase not initialized, skipping token verification")
        return None

    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        return decoded_token
    except firebase_auth.InvalidIdTokenError:
        logger.warning("Invalid Firebase ID token")
        return None
    except firebase_auth.ExpiredIdTokenError:
        logger.warning("Expired Firebase ID token")
        return None
    except Exception as e:
        logger.error(f"Firebase token verification error: {e}")
        return None
