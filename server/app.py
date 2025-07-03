import asyncio
from aiohttp import web
import aiohttp_cors
import os
import dotenv
import logging
from src.server.routes import setup_routes
from aiohttp_apispec import validation_middleware, setup_aiohttp_apispec
from src.server.auth import auth_middleware

dotenv.load_dotenv()

SERVER_HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.environ.get("SERVER_PORT", 8080))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_app() -> web.Application:
    app = web.Application()
    app["api_key"] = os.environ.get("GEMINI_API_KEY")
    if not app["api_key"]:
        raise ValueError("GEMINI_API_KEY not found in environment variables.")
    app["text_model_name"] = os.environ.get("GEMINI_MODEL_NAME", "gemini-1.5-flash")
    app["max_sentences"] = 2  # Default to 2 sentences for responses
    setup_routes(app)
    logger.info("Routes have been set up.")
    cors = aiohttp_cors.setup(
        app,
        defaults={
            os.environ.get("CLIENT_URL"): aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*",
            )
        },
    )
    for route in list(app.router.routes()):
        cors.add(route)
    app.middlewares.append(validation_middleware)
    app.middlewares.append(auth_middleware)
    setup_aiohttp_apispec(app=app)
    return app


if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    app_instance = loop.run_until_complete(create_app())
    logger.info(f"Starting Debate AI Backend on http://{SERVER_HOST}:{SERVER_PORT}")
    web.run_app(app_instance, host=SERVER_HOST, port=SERVER_PORT)
