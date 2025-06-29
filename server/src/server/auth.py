# src/server/auth.py
import jwt
import aiohttp
import json
import os
from aiohttp import web
import logging
import re  # For path matching
from src.database.database import async_session, get_items_by_filters, create_item
import src.database.models as db_models


logger = logging.getLogger(__name__)

AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN")
API_AUDIENCE = os.environ.get("AUTH0_API_AUDIENCE")
ALGORITHMS = ["RS256"]

jwks_cache = None


async def get_jwks():
    global jwks_cache
    if jwks_cache:
        return jwks_cache

    if not AUTH0_DOMAIN:
        logger.error("AUTH0_DOMAIN not set for JWKS fetching.")
        raise web.HTTPInternalServerError(
            text=json.dumps({"error": "Auth configuration error (domain)."}),
            content_type="application/json",
        )

    jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(jwks_url) as resp:
                resp.raise_for_status()
                jwks_data = await resp.json()
                jwks_cache = jwks_data
                logger.info("JWKS fetched and cached successfully.")
                return jwks_data
    except aiohttp.ClientError as e:
        logger.error(f"Failed to fetch JWKS: {e}")
        raise web.HTTPInternalServerError(
            text=json.dumps({"error": f"Could not fetch JWKS: {e}"}),
            content_type="application/json",
        )


class AuthError(Exception):
    def __init__(self, error, status_code):
        self.error = error
        self.status_code = status_code


async def verify_jwt(token: str):
    if not AUTH0_DOMAIN or not API_AUDIENCE:
        logger.error("Auth0 domain or API audience not configured on backend.")
        raise AuthError(
            {
                "code": "config_error",
                "description": "Authentication service not configured.",
            },
            500,
        )

    try:
        jwks = await get_jwks()
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        logger.warning(f"JWT Error (unverified header): {e}")
        raise AuthError(
            {
                "code": "invalid_header",
                "description": "Unable to parse authentication token.",
            },
            401,
        )
    except Exception as e:
        logger.error(f"Error during JWKS fetch/unverified header processing: {e}")
        raise AuthError(
            {
                "code": "processing_error",
                "description": "Error processing token header or JWKS.",
            },
            500,
        )

    rsa_key = {}
    for key in jwks["keys"]:
        if key["kid"] == unverified_header.get("kid"):
            rsa_key = {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key["use"],
                "n": key["n"],
                "e": key["e"],
            }
            break  # Found the key

    if not rsa_key:
        logger.warning("RSA key not found in JWKS for the given KID.")
        raise AuthError(
            {"code": "invalid_header", "description": "Unable to find appropriate key"},
            401,
        )

    try:
        from jose import jwt as jose_jwt  # python-jose is often simpler for Auth0 JWKS

        payload = jose_jwt.decode(
            token,
            rsa_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        return payload
    except jwt.ExpiredSignatureError:  # jose.exceptions.ExpiredSignatureError
        logger.warning("Token is expired.")
        raise AuthError(
            {"code": "token_expired", "description": "Token is expired."}, 401
        )
    except jwt.InvalidAudienceError:  # jose.exceptions.InvalidAudienceError
        logger.warning(f"Invalid audience. Expected: {API_AUDIENCE}")
        raise AuthError(
            {"code": "invalid_audience", "description": "Incorrect audience."}, 401
        )
    except jwt.InvalidIssuerError:  # jose.exceptions.InvalidIssuerError
        logger.warning(f"Invalid issuer. Expected: https://{AUTH0_DOMAIN}/")
        raise AuthError(
            {"code": "invalid_issuer", "description": "Incorrect issuer."}, 401
        )
    except Exception as e:  # Catch broader jose.exceptions.JWTError or others
        logger.error(
            f"Error decoding/validating token with jose: {type(e).__name__} - {e}"
        )
        raise AuthError(
            {
                "code": "invalid_token",
                "description": "Unable to validate authentication token.",
            },
            401,
        )


# --- New Authentication Middleware ---
@web.middleware
async def auth_middleware(request: web.Request, handler):
    public_paths = [
        re.compile(r"^/api/docs(/.*)?$"),
        re.compile(r"^/static(/.*)?$"),
    ]

    # Allow OPTIONS requests to pass through for CORS preflight
    if request.method in ("OPTIONS", "HEAD"):
        return await handler(request)

    # Check if the current path is public
    for pattern in public_paths:
        if pattern.match(request.path):
            logger.debug(f"Public path, skipping auth: {request.path}")
            return await handler(request)

    # For all other paths, enforce authentication
    logger.debug(f"Protected path, requiring auth: {request.path}")
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        logger.warning(f"Authorization header missing for {request.path}")
        return web.json_response(
            {
                "code": "authorization_header_missing",
                "description": "Authorization header is expected.",
            },
            status=401,
        )

    parts = auth_header.split()
    if parts[0].lower() != "bearer" or len(parts) != 2:
        logger.warning(f"Invalid Authorization header format for {request.path}")
        return web.json_response(
            {
                "code": "invalid_header",
                "description": "Authorization header must be 'Bearer token'.",
            },
            status=401,
        )

    token = parts[1]
    try:
        payload = await verify_jwt(token)
        user_id = payload.get("sub")
        if not user_id:
            logger.warning(f"Token payload missing 'sub' for {request.path}")
            return web.json_response(
                {
                    "code": "invalid_token",
                    "description": "Token payload is missing 'sub'.",
                },
                status=401,
            )
        # check if user exists in the database
        async with async_session() as session:
            users: list[db_models.User] = await get_items_by_filters(
                session,
                db_models.User,
                filters={"auth_id": user_id},
            )
            if not users:
                # create a new user if not exists
                user: db_models.User = await create_item(
                    session, {"auth_id": user_id}, db_models.User
                )
                if not user:
                    logger.error(
                        f"Failed to create user for {user_id} in {request.path}"
                    )
                    return web.json_response(
                        {
                            "code": "internal_error",
                            "description": "Failed to create user.",
                        },
                        status=500,
                    )
            else:
                user = users[0]
        request["user"] = payload
        request["user_id"] = user.id
        logger.info(f"User {payload.get('sub')} authenticated for {request.path}")
        return await handler(request)
    except AuthError as e:
        logger.warning(
            f"AuthError for {request.path}: Code: {e.error.get('code')}, Desc: {e.error.get('description')}"
        )
        return web.json_response(e.error, status=e.status_code)
    except (
        web.HTTPException
    ) as e_http:  # For errors raised directly from verify_jwt like config issues
        logger.error(f"HTTPException during auth for {request.path}: {e_http.reason}")
        return e_http  # Re-raise if it's already an HTTP error response
    except Exception as e:
        logger.error(
            f"Unexpected error in auth middleware for {request.path}: {type(e).__name__} - {e}"
        )
        return web.json_response(
            {
                "code": "internal_error",
                "description": "An unexpected error occurred during authentication.",
            },
            status=500,
        )
