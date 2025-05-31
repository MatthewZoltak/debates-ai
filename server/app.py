import asyncio
from aiohttp import web
import aiohttp_cors
import os
import dotenv
from google import genai  # For initializing client in state
import logging
from src.server.routes import setup_routes  # Import setup_routes from the same package
from aiohttp_apispec import validation_middleware, setup_aiohttp_apispec

dotenv.load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_app():
    app = web.Application()

    # --- Configurations and Global State ---
    app["api_key"] = os.environ.get("GEMINI_API_KEY")
    if not app["api_key"]:
        raise ValueError("GEMINI_API_KEY not found in environment variables.")

    app["text_model_name"] = os.environ.get(
        "GEMINI_MODEL_NAME", "gemini-1.5-flash"
    )  # Updated to a more recent model
    app["max_sentences"] = 2

    # Initialize debate_state and genai clients here
    # This state will be shared across requests via request.app['debate_state']
    app["debate_state"] = {
        "topic": None,
        "clients": {
            "pro": {
                "client": genai.Client(api_key=app["api_key"]),  # Initialize client
                "chat": None,
                "voice": "Kore",
            },
            "con": {
                "client": genai.Client(api_key=app["api_key"]),  # Initialize client
                "chat": None,
                "voice": "Sadaltager",
            },
            "moderator": {
                "client": genai.Client(api_key=app["api_key"]),  # Initialize client
                "voice": "Zephyr",
            },
        },
        "moderator_history": [],
        "pro_llm_history": [],
        "con_llm_history": [],
        "current_turn": "pro",
        "debate_log": [],
        "questions": [],
    }

    # Setup routes
    setup_routes(app)
    logger.info("Routes have been set up.")

    # Configure CORS
    cors = aiohttp_cors.setup(
        app,
        defaults={
            "http://localhost:3000": aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*",  # Allow all standard methods
            )
        },
    )

    # Apply CORS to all routes
    for route in list(app.router.routes()):
        cors.add(route)

    # Add validation middleware
    app.middlewares.append(validation_middleware)

    setup_aiohttp_apispec(
        app=app,
        title="My Documentation",
        version="v1",
        url="/api/docs/swagger.json",
        swagger_path="/api/docs",
    )
    return app


if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    app_instance = loop.run_until_complete(create_app())
    logger.info("Starting Debate AI Backend on http://localhost:5000")
    web.run_app(app_instance, host="localhost", port=5000)  # Flask default port is 5000
