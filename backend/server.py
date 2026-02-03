from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone
import ably
import pusher


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# WebSocket providers
ably_client = None
pusher_client = None

def get_ably_client():
    global ably_client
    if ably_client is None:
        ably_key = os.environ.get('ABLY_KEY')
        if ably_key:
            ably_client = ably.AblyRest(ably_key)
    return ably_client

def get_pusher_client():
    global pusher_client
    if pusher_client is None:
        app_id = os.environ.get('PUSHER_APP_ID')
        key = os.environ.get('PUSHER_KEY')
        secret = os.environ.get('PUSHER_SECRET')
        cluster = os.environ.get('PUSHER_CLUSTER')
        if app_id and key and secret and cluster:
            pusher_client = pusher.Pusher(
                app_id=app_id,
                key=key,
                secret=secret,
                cluster=cluster,
                ssl=True
            )
    return pusher_client

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks


# WebSocket Publishing Models
class WebSocketPublishRequest(BaseModel):
    provider: str  # "1" for Ably, "2" for Pusher
    channel_id: str
    data: Dict[str, Any]

class WebSocketPublishResponse(BaseModel):
    success: bool
    message: str
    provider: str

# WebSocket Publishing Endpoints
@api_router.post("/ws/publish", response_model=WebSocketPublishResponse)
async def publish_to_websocket(request: WebSocketPublishRequest):
    """
    Publish data to a WebSocket channel.
    Provider: "1" = Ably, "2" = Pusher
    """
    channel_name = f"rally-{request.channel_id}"
    
    try:
        if request.provider == "1":
            # Ably
            client = get_ably_client()
            if not client:
                return WebSocketPublishResponse(
                    success=False,
                    message="Ably not configured",
                    provider="Ably"
                )
            channel = client.channels.get(channel_name)
            channel.publish("update", request.data)
            return WebSocketPublishResponse(
                success=True,
                message="Published to Ably",
                provider="Ably"
            )
        
        elif request.provider == "2":
            # Pusher
            client = get_pusher_client()
            if not client:
                return WebSocketPublishResponse(
                    success=False,
                    message="Pusher not configured",
                    provider="Pusher"
                )
            client.trigger(channel_name, "update", request.data)
            return WebSocketPublishResponse(
                success=True,
                message="Published to Pusher",
                provider="Pusher"
            )
        
        else:
            return WebSocketPublishResponse(
                success=False,
                message=f"Unknown provider: {request.provider}",
                provider="Unknown"
            )
    
    except Exception as e:
        logger.error(f"WebSocket publish error: {str(e)}")
        return WebSocketPublishResponse(
            success=False,
            message=str(e),
            provider=request.provider
        )

@api_router.get("/ws/status")
async def websocket_status():
    """Check WebSocket providers status"""
    return {
        "ably": {
            "configured": get_ably_client() is not None,
            "key_present": bool(os.environ.get('ABLY_KEY'))
        },
        "pusher": {
            "configured": get_pusher_client() is not None,
            "key_present": bool(os.environ.get('PUSHER_KEY'))
        }
    }


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()