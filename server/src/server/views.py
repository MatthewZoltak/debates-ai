from aiohttp import web
from google import genai
import logging
from sqlalchemy import select, func
from .utils import (
    start_chat,
    send_chat_message,
    generate_text_content,
    encrypt_api_key,
    decrypt_api_key,
)
from src.database.database import (
    async_session,
    create_item,
    get_item_by_id,
    update_item,
    get_items_by_filters,
)
import src.database.models as db_models


from .schemas import (
    StartDebateRequest,
    StartDebateResponse,
    ProcessTurnRequest,
    ProcessTurnResponse,
    ClosingArgmentRequest,
    ClosingArgmentResponse,
    JudgeDebateResponse,
    JudgeDebateRequest,
    GetDebateRequest,
    GetDebateResponse,
    GetUserDebatesResponse,
    GetUserDebatesRequest,
    GetPublicDebatesRequest,
    GetPublicDebatesResponse,
    ToggleDebateVisibilityRequest,
    ToggleDebateVisibilityResponse,
    ToggleLikeRequest,
    ToggleLikeResponse,
)
from aiohttp_apispec import (
    docs,
    request_schema,
    querystring_schema,
)

from marshmallow import Schema, fields

class UserAPIKeyRequest(Schema):
    api_key = fields.String(required=True)
    nickname = fields.String(required=True)
    provider = fields.String(required=True, default='gemini')

class UserAPIKeyResponse(Schema):
    has_key = fields.Boolean(required=True)
    valid = fields.Boolean(required=True)

class UserAPIKeyListItem(Schema):
    id = fields.Integer(required=True)
    provider = fields.String(required=True)
    nickname = fields.String(required=True)
    created_at = fields.DateTime()
    updated_at = fields.DateTime()

class UserAPIKeyListResponse(Schema):
    api_keys = fields.List(fields.Nested(UserAPIKeyListItem), required=True)

class UserAPIKeyValueResponse(Schema):
    id = fields.Integer(required=True)
    provider = fields.String(required=True)
    nickname = fields.String(required=True)
    value = fields.String(required=True)

logger = logging.getLogger(__name__)


@docs(
    tags=["start debate"],
    summary="Starts a new debate",
    description="Starts a new debate with the given topic.",
    responses={
        200: {
            "schema": StartDebateResponse,
            "description": "Success response",
        },
        404: {"description": "Not found"},
        422: {"description": "Validation error"},
    },
)
@request_schema(StartDebateRequest)
async def start_debate_view(request) -> web.Response:
    user_id = request["user_id"]
    data = request["data"]
    topic = data["topic"]
    text_model_name = data.get("model")
    api_key_id = data.get("api_key_id")
    max_sentences = request.app["max_sentences"]

    # Fetch user's specific API key
    async with async_session() as session:
        api_key_record = await get_item_by_id(session, api_key_id, db_models.UserAPIKey)
        if not api_key_record or api_key_record.user_id != user_id:
            return web.json_response({"error": "API key not found or access denied."}, status=403)
        try:
            api_key = decrypt_api_key(api_key_record.api_key_encrypted)
        except Exception:
            return web.json_response({"error": "Invalid or corrupted API key."}, status=403)

    debate_logs = []

    pro_client = genai.Client(api_key=api_key)
    con_client = genai.Client(api_key=api_key)

    initial_prompt = f"Debate topic: {topic}. Pro side will argue in favor, Con side will argue against. I, the moderator will manage the debate."

    pro_side_chat = start_chat(
        pro_client,
        system_instructions=f"{initial_prompt} You are on the pro side of a debate. Your goal is to argue for the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
    )
    con_side_chat = start_chat(
        con_client,
        system_instructions=f"{initial_prompt} You are on the con side of a debate. Your goal is to argue against the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
    )

    pro_side_response = (
        await send_chat_message(
            pro_side_chat, f"Opening statement for the debate topic: {topic}"
        )
    ).text
    con_side_response = (
        await send_chat_message(
            con_side_chat, f"Opening statement for the debate topic: {topic}"
        )
    ).text

    debate_logs.append(
        {
            "speaker": "moderator",
            "response_type": "opening_statement",
            "text": initial_prompt,
        }
    )
    debate_logs.append(
        {
            "speaker": "pro",
            "response_type": "opening_statement",
            "text": pro_side_response,
        }
    )
    debate_logs.append(
        {
            "speaker": "con",
            "response_type": "opening_statement",
            "text": con_side_response,
        }
    )
    async with async_session() as session:
        pro_side_chat_history = [
            content.dict() for content in pro_side_chat.get_history()
        ]
        con_side_chat_history = [
            content.dict() for content in con_side_chat.get_history()
        ]
        debate: db_models.Debate = await create_item(
            session,
            {
                "topic": topic,
                "user_id": user_id,
                "logs": debate_logs,
                "pro_chat_history": pro_side_chat_history,
                "con_chat_history": con_side_chat_history,
            },
            db_models.Debate,
        )

    response_data = StartDebateResponse().dump(
        {
            "message": "Debate started",
            "debate_id": debate.id,
            "topic": topic,
            "pro_initial": pro_side_response,
            "con_initial": con_side_response,
            "logs": debate_logs,
        }
    )

    logger.info(f"Debate started with topic: {topic}, response data: {response_data}")
    return web.json_response(response_data, status=200)


@docs(
    tags=["process turn"],
    summary="Processes a turn in the debate",
    description="Processes a turn in the debate by sending a question to both sides and getting their responses.",
    responses={
        200: {
            "schema": ProcessTurnResponse,
            "description": "Success response with responses from both sides",
        },
        400: {"description": "Bad request"},
        404: {"description": "Not found"},
        422: {"description": "Validation error"},
    },
)
@request_schema(ProcessTurnRequest)
async def process_turn_view(request) -> web.Response:
    max_sentences = request.app["max_sentences"]
    api_key = request.app["api_key"]
    text_model_name = request.app["text_model_name"]
    data = request["data"]
    question = data["question"]
    debate_id = data["debate_id"]

    async with async_session() as session:
        debate: db_models.Debate = await get_item_by_id(
            session, debate_id, db_models.Debate
        )
    if not debate:
        return web.json_response({"error": "Debate not found"}, status=404)

    pro_client = genai.Client(api_key=api_key)
    con_client = genai.Client(api_key=api_key)
    pro_client_chat = start_chat(
        pro_client,
        system_instructions=f"{debate.topic} You are on the pro side of a debate. Your goal is to argue for the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
        history=debate.pro_chat_history or [],
    )
    con_client_chat = start_chat(
        con_client,
        system_instructions=f"{debate.topic} You are on the con side of a debate. Your goal is to argue against the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
        history=debate.con_chat_history or [],
    )

    if not pro_client_chat or not con_client_chat:
        return web.json_response(
            {"error": "Chat not initialized. Start debate first."}, status=400
        )

    debate_logs = debate.logs

    pro_side_response = (
        await send_chat_message(
            pro_client_chat,
            f"Respond to the question in favour of: {question}. Provide your argument in {max_sentences} sentences.",
        )
    ).text
    con_side_response = (
        await send_chat_message(
            con_client_chat,
            f"Respond to the question in opposition to: {question}. Provide your argument in {max_sentences} sentences.",
        )
    ).text
    debate_logs.append(
        {
            "speaker": "moderator",
            "response_type": "intitial_question_response",
            "text": question,
        }
    )
    debate_logs.append(
        {
            "speaker": "pro",
            "response_type": "intitial_question_response",
            "text": pro_side_response,
        }
    )
    debate_logs.append(
        {
            "speaker": "con",
            "response_type": "intitial_question_response",
            "text": con_side_response,
        }
    )
    pro_side_rebuttal = (
        await send_chat_message(
            pro_client_chat,
            f"Rebuttal to the con side's argument: {con_side_response}. Provide your rebuttal in {max_sentences} sentences.",
        )
    ).text
    con_side_rebuttal = (
        await send_chat_message(
            con_client_chat,
            f"Rebuttal to the pro side's argument: {pro_side_response}. Provide your rebuttal in {max_sentences} sentences.",
        )
    ).text
    debate_logs.append(
        {
            "speaker": "pro",
            "response_type": "rebuttal",
            "text": pro_side_rebuttal,
        }
    )
    debate_logs.append(
        {
            "speaker": "con",
            "response_type": "rebuttal",
            "text": con_side_rebuttal,
        }
    )
    debate.logs = debate_logs
    questions = debate.questions
    questions.append(question)
    async with async_session() as session:
        pro_chat_history = [content.dict() for content in pro_client_chat.get_history()]
        con_chat_history = [content.dict() for content in con_client_chat.get_history()]
        update_dict = {
            "logs": debate.logs,
            "questions": questions,
            "pro_chat_history": pro_chat_history,
            "con_chat_history": con_chat_history,
        }
        await update_item(session, debate.id, update_dict, db_models.Debate)

    response_data = ProcessTurnResponse().dump(
        {
            "message": "Turn processed",
            "question": question,
            "pro_side_response": pro_side_response,
            "con_side_response": con_side_response,
            "pro_side_rebuttal": pro_side_rebuttal,
            "con_side_rebuttal": con_side_rebuttal,
            "logs": debate.logs,
            "questions": debate.questions,
        }
    )
    return web.json_response(response_data)


@docs(
    tags=["closing arguments"],
    summary="Processes closing arguments for both sides",
    description="Processes closing arguments for both sides of the debate.",
    responses={
        200: {
            "schema": ClosingArgmentResponse,
            "description": "Success response with closing arguments from both sides",
        },
        400: {"description": "Bad request"},
        404: {"description": "Not found"},
        422: {"description": "Validation error"},
    },
)
@request_schema(ClosingArgmentRequest)
async def closing_arguments_view(request) -> web.Response:
    api_key = request.app["api_key"]
    text_model_name = request.app["text_model_name"]
    max_sentences = request.app["max_sentences"]

    data = request["data"]
    debate_id: int = data["debate_id"]
    async with async_session() as session:
        debate: db_models.Debate = await get_item_by_id(
            session, debate_id, db_models.Debate
        )
    if not debate:
        return web.json_response({"error": "Debate not found"}, status=404)
    if not debate.topic:
        return web.json_response({"error": "Debate not started"}, status=400)

    pro_client = genai.Client(api_key=api_key)
    con_client = genai.Client(api_key=api_key)
    pro_client_chat = start_chat(
        pro_client,
        system_instructions=f"{debate.topic} You are on the pro side of a debate. Your goal is to argue for the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
        history=debate.pro_chat_history or [],
    )
    con_client_chat = start_chat(
        con_client,
        system_instructions=f"{debate.topic} You are on the con side of a debate. Your goal is to argue against the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
        history=debate.con_chat_history or [],
    )

    if not pro_client_chat or not con_client_chat:
        return web.json_response(
            {"error": "Chat not initialized. Start debate first."}, status=400
        )

    pro_closing = (
        await send_chat_message(
            pro_client_chat,
            f"Provide your closing argument for the debate in {max_sentences} sentences.",
        )
    ).text

    con_closing = (
        await send_chat_message(
            con_client_chat,
            f"Provide your closing argument for the debate in {max_sentences} sentences.",
        )
    ).text

    debate.logs.append(
        {
            "speaker": "moderator",
            "response_type": "closing_argument",
            "text": "We will now hear the closing arguments from both sides.",
        }
    )

    debate.logs.append(
        {
            "speaker": "pro",
            "response_type": "closing_argument",
            "text": pro_closing,
        }
    )
    debate.logs.append(
        {
            "speaker": "con",
            "response_type": "closing_argument",
            "text": con_closing,
        }
    )
    async with async_session() as session:
        pro_chat_history = [content.dict() for content in pro_client_chat.get_history()]
        con_chat_history = [content.dict() for content in con_client_chat.get_history()]
        await update_item(
            session,
            debate.id,
            {
                "logs": debate.logs,
                "pro_chat_history": pro_chat_history,
                "con_chat_history": con_chat_history,
            },
            db_models.Debate,
        )
    logger.info(
        f"Closing arguments processed for debate ID {debate_id}: Pro: {pro_closing}, Con: {con_closing}"
    )
    response_data = ClosingArgmentResponse().dump(
        {
            "message": "Closing arguments processed",
            "pro_closing": pro_closing,
            "con_closing": con_closing,
            "logs": debate.logs,
            "questions": debate.questions,
        }
    )
    return web.json_response(response_data)


@docs(
    tags=["judge debate"],
    summary="Judges the debate",
    description="Judges the debate and provides a final judgment on who won.",
    responses={
        200: {
            "schema": JudgeDebateResponse,
            "description": "Success response with judgment",
        },
        400: {"description": "Bad request"},
        404: {"description": "Not found"},
        422: {"description": "Validation error"},
    },
)
@request_schema(JudgeDebateRequest)
async def judge_debate_view(request) -> web.Response:
    api_key = request.app["api_key"]
    data = request["data"]
    debate_id = data["debate_id"]
    async with async_session() as session:
        debate: db_models.Debate = await get_item_by_id(
            session, debate_id, db_models.Debate
        )
    if not debate:
        return web.json_response({"error": "Debate not found"}, status=404)
    if not debate.topic:
        return web.json_response({"error": "Debate not started"}, status=400)
    if not debate.logs:
        return web.json_response({"error": "No debate logs found"}, status=400)

    moderator_client = genai.Client(api_key=api_key)
    judgment_prompt = f"Based on the debate about {debate.topic}, provide a final judgment on who won the debate. Consider all arguments and rebuttals. Give one word answer: 'pro' or 'con'. Here is the transcript of the debate: {debate.logs}"

    judgment = (
        await generate_text_content(
            moderator_client,
            judgment_prompt,
            request.app["text_model_name"],
            "You are a debate judge. Analyze the debate transcript and provide a final judgment on who won the debate.",
        )
        .text.strip()
        .lower()
    )

    if judgment not in ["pro", "con"]:
        if "pro" in judgment:
            judgment = "pro"
        elif "con" in judgment:
            judgment = "con"
        else:
            return web.json_response(
                {
                    "error": f"Invalid judgment received from model: {judgment}. Expected 'pro' or 'con'."
                },
                status=500,
            )

    debate.logs.append(
        {
            "speaker": "moderator",
            "response_type": "narration",
            "text": "We will now hear the final judgment on the debate.",
        }
    )

    debate.logs.append(
        {
            "speaker": "moderator",
            "response_type": "judgment",
            "text": f"Judgment: The winner is {judgment}.",
        }
    )
    async with async_session() as session:
        await update_item(
            session,
            debate.id,
            {"logs": debate.logs, "winner": judgment},
            db_models.Debate,
        )
    logger.info(f"Debate judged: {judgment}")
    response_data = JudgeDebateResponse().dump(
        {
            "message": "Debate judged",
            "judgment": judgment,
            "logs": debate.logs,
            "questions": debate.questions,
            "winner": judgment,
        }
    )

    return web.json_response(response_data)


@docs(
    tags=["get debate"],
    summary="Retrieves a debate by ID",
    description="Retrieves the details of a debate by its ID.",
    responses={
        200: {
            "schema": GetDebateResponse,
            "description": "Success response with debate details",
        },
        404: {"description": "Debate not found"},
        422: {"description": "Validation error"},
    },
)
@querystring_schema(GetDebateRequest)
async def get_debate(request) -> web.Response:
    query_params = request["querystring"]
    debate_id: int = query_params["debate_id"]
    current_user_id = request.get("user_id")
    
    async with async_session() as session:
        debate: db_models.Debate = await get_item_by_id(
            session, debate_id, db_models.Debate
        )
    if not debate:
        return web.json_response({"error": "Debate not found"}, status=404)
    
    # Get creator name
    creator = await get_item_by_id(session, debate.user_id, db_models.User)
    creator_name = creator.name if creator else "Unknown User"
    
    # Get like count
    like_count = await session.scalar(
        select(func.count(db_models.UserLike.id)).where(
            db_models.UserLike.debate_id == debate.id
        )
    )
    
    # Check if current user liked this debate
    is_liked_by_user = False
    if current_user_id:
        existing_like = await session.scalar(
            select(db_models.UserLike).where(
                db_models.UserLike.debate_id == debate.id,
                db_models.UserLike.user_id == current_user_id
            )
        )
        is_liked_by_user = existing_like is not None
    
    response_data = GetDebateResponse().dump(
        {
            "id": debate.id,
            "user_id": debate.user_id,
            "topic": debate.topic,
            "logs": debate.logs,
            "questions": debate.questions,
            "winner": debate.winner,
            "is_public": debate.is_public,
            "created_at": debate.created_at,
            "updated_at": debate.updated_at,
            "like_count": like_count,
            "is_liked_by_user": is_liked_by_user,
            "creator_name": creator_name,
        }
    )
    return web.json_response(response_data, status=200)


@docs(
    tags=["get user debates"],
    summary="Retrieves all debates for a user",
    description="Retrieves all debates associated with a specific user.",
    responses={
        200: {
            "schema": GetUserDebatesResponse,
            "description": "Success response with list of debates",
        },
        404: {"description": "User not found"},
        422: {"description": "Validation error"},
    },
)
@querystring_schema(GetUserDebatesRequest)
async def get_user_debates(request) -> web.Response:
    user_id = request["user_id"]
    async with async_session() as session:
        filters = {"user_id": user_id}
        debates: list[db_models.Debate] = await get_items_by_filters(
            session,
            db_models.Debate,
            **filters,
        )
    if not debates:
        return web.json_response({"debates": []})
    
    # Get user info for creator name
    creator = await get_item_by_id(session, user_id, db_models.User)
    creator_name = creator.name if creator else "Unknown User"
    
    result_debates = []
    for debate in debates:
        # Get like count for each debate
        like_count = await session.scalar(
            select(func.count(db_models.UserLike.id)).where(
                db_models.UserLike.debate_id == debate.id
            )
        )
        
        # Check if current user liked this debate
        existing_like = await session.scalar(
            select(db_models.UserLike).where(
                db_models.UserLike.debate_id == debate.id,
                db_models.UserLike.user_id == user_id
            )
        )
        is_liked_by_user = existing_like is not None
        
        result_debates.append({
            "id": debate.id,
            "user_id": debate.user_id,
            "topic": debate.topic,
            "questions": debate.questions,
            "logs": debate.logs,
            "winner": debate.winner,
            "is_public": debate.is_public,
            "created_at": debate.created_at,
            "updated_at": debate.updated_at,
            "like_count": like_count,
            "is_liked_by_user": is_liked_by_user,
            "creator_name": creator_name,
        })
    
    response_data = GetUserDebatesResponse().dump({"debates": result_debates})
    return web.json_response(response_data, status=200)


# --- User API Key Endpoints ---
@docs(
    tags=["user api key"],
    summary="Set or update the user's Gemini API key",
    description="Stores the user's Gemini API key (encrypted).",
    responses={200: {"description": "API key saved"}, 400: {"description": "Bad request"}},
)
@request_schema(UserAPIKeyRequest)
async def set_user_api_key_view(request):
    user_id = request["user_id"]
    data = request["data"]
    api_key = data.get("api_key")
    nickname = data.get("nickname")
    provider = data.get("provider", "gemini")
    
    if not api_key:
        return web.json_response({"error": "API key required"}, status=400)
    if not nickname:
        return web.json_response({"error": "Nickname required"}, status=400)
    
    encrypted = encrypt_api_key(api_key)
    async with async_session() as session:
        # Create new API key (allow multiple keys per user)
        await create_item(session, {
            "user_id": user_id, 
            "provider": provider, 
            "nickname": nickname,
            "api_key_encrypted": encrypted
        }, db_models.UserAPIKey)
    return web.json_response({"message": "API key saved"})

@docs(
    tags=["user api key"],
    summary="Check if user has a Gemini API key",
    description="Returns whether the user has a Gemini API key set.",
    responses={200: {"schema": UserAPIKeyResponse, "description": "API key status"}},
)
async def get_user_api_key_view(request):
    user_id = request["user_id"]
    async with async_session() as session:
        existing = await get_items_by_filters(session, db_models.UserAPIKey, user_id=user_id, provider="gemini")
        if not existing:
            return web.json_response({"has_key": False, "valid": False, "api_keys": []})
        
        # Check validity of all keys
        valid_keys = []
        for key in existing:
            try:
                decrypt_api_key(key.api_key_encrypted)
                valid_keys.append({
                    "id": key.id,
                    "nickname": key.nickname,
                    "provider": key.provider
                })
            except Exception:
                continue
        
        has_valid_key = len(valid_keys) > 0
        return web.json_response({
            "has_key": len(existing) > 0, 
            "valid": has_valid_key,
            "api_keys": valid_keys
        })

@docs(
    tags=["user api key"],
    summary="List all API keys for the user",
    description="Returns a list of the user's API keys (id, provider/model, created_at, updated_at, but NOT the value).",
    responses={200: {"schema": UserAPIKeyListResponse, "description": "List of API keys"}},
)
async def list_user_api_keys_view(request):
    user_id = request["user_id"]
    async with async_session() as session:
        keys = await get_items_by_filters(session, db_models.UserAPIKey, user_id=user_id)
        result = [
            {
                "id": k.id,
                "provider": k.provider,
                "nickname": k.nickname,
                "created_at": k.created_at,
                "updated_at": k.updated_at,
            }
            for k in keys
        ]
    response_data = UserAPIKeyListResponse().dump({"api_keys": result})
    return web.json_response(response_data)

@docs(
    tags=["user api key"],
    summary="Get the decrypted value for a single API key",
    description="Returns the decrypted value for a single API key (only when requested by the user).",
    responses={200: {"schema": UserAPIKeyValueResponse, "description": "Decrypted API key value"}, 404: {"description": "Not found"}},
)
async def get_user_api_key_value_view(request):
    user_id = request["user_id"]
    key_id = int(request.match_info["id"])
    async with async_session() as session:
        key = await get_item_by_id(session, key_id, db_models.UserAPIKey)
        if not key or key.user_id != user_id:
            return web.json_response({"error": "API key not found"}, status=404)
        try:
            value = decrypt_api_key(key.api_key_encrypted)
        except Exception:
            return web.json_response({"error": "Failed to decrypt API key"}, status=500)
    response_data = UserAPIKeyValueResponse().dump({"id": key.id, "provider": key.provider, "nickname": key.nickname, "value": value})
    return web.json_response(response_data)

@docs(
    tags=["user api key"],
    summary="Update a user's API key by id",
    description="Updates the encrypted value and/or provider for a user's API key.",
    responses={200: {"description": "API key updated"}, 404: {"description": "Not found"}},
)
@request_schema(UserAPIKeyRequest)
async def update_user_api_key_view(request):
    user_id = request["user_id"]
    key_id = int(request.match_info["id"])
    data = await request.json()
    async with async_session() as session:
        key = await get_item_by_id(session, key_id, db_models.UserAPIKey)
        if not key or key.user_id != user_id:
            return web.json_response({"error": "API key not found"}, status=404)
        update_dict = {}
        if "api_key" in data:
            update_dict["api_key_encrypted"] = encrypt_api_key(data["api_key"])
        if "provider" in data:
            update_dict["provider"] = data["provider"]
        if "nickname" in data:
            update_dict["nickname"] = data["nickname"]
        if update_dict:
            await update_item(session, key_id, update_dict, db_models.UserAPIKey)
    return web.json_response({"message": "API key updated"})

@docs(
    tags=["user api key"],
    summary="Delete a user's API key by id",
    description="Deletes a user's API key by id.",
    responses={200: {"description": "API key deleted"}, 404: {"description": "Not found"}},
)
async def delete_user_api_key_view(request):
    user_id = request["user_id"]
    key_id = int(request.match_info["id"])
    async with async_session() as session:
        key = await get_item_by_id(session, key_id, db_models.UserAPIKey)
        if not key or key.user_id != user_id:
            return web.json_response({"error": "API key not found"}, status=404)
        await session.delete(key)
        await session.commit()
    return web.json_response({"message": "API key deleted"})

# --- Public Debate Endpoints ---

@docs(
    tags=["public debates"],
    summary="Get public debates",
    description="Retrieves a paginated list of public debates with sorting options.",
    responses={
        200: {
            "schema": GetPublicDebatesResponse,
            "description": "Success response with list of public debates",
        },
        422: {"description": "Validation error"},
    },
)
@querystring_schema(GetPublicDebatesRequest)
async def get_public_debates(request) -> web.Response:
    query_params = request["querystring"]
    page = query_params.get("page", 1)
    per_page = query_params.get("per_page", 10)
    sort_by = query_params.get("sort_by", "created_at")
    
    # Calculate offset
    offset = (page - 1) * per_page
    
    async with async_session() as session:
        # Get total count of public debates
        count_query = select(func.count(db_models.Debate.id)).where(db_models.Debate.is_public == True)
        total_count = await session.scalar(count_query)
        
        # Build query with sorting
        query = select(db_models.Debate).where(db_models.Debate.is_public == True)
        
        if sort_by == "likes":
            # Sort by like count (subquery to count likes)
            like_count = select(func.count(db_models.UserLike.id)).where(
                db_models.UserLike.debate_id == db_models.Debate.id
            ).scalar_subquery()
            query = query.order_by(like_count.desc())
        elif sort_by == "topic":
            query = query.order_by(db_models.Debate.topic.asc())
        else:  # created_at
            query = query.order_by(db_models.Debate.created_at.desc())
        
        # Add pagination
        query = query.offset(offset).limit(per_page)
        
        debates = await session.execute(query)
        debates = debates.scalars().all()
        
        # Get user info and like counts for each debate
        current_user_id = request.get("user_id")
        result_debates = []
        
        for debate in debates:
            # Get creator name
            creator = await get_item_by_id(session, debate.user_id, db_models.User)
            creator_name = creator.name if creator else "Unknown User"
            
            # Get like count
            like_count = await session.scalar(
                select(func.count(db_models.UserLike.id)).where(
                    db_models.UserLike.debate_id == debate.id
                )
            )
            
            # Check if current user liked this debate
            is_liked_by_user = False
            if current_user_id:
                existing_like = await session.scalar(
                    select(db_models.UserLike).where(
                        db_models.UserLike.debate_id == debate.id,
                        db_models.UserLike.user_id == current_user_id
                    )
                )
                is_liked_by_user = existing_like is not None
            
            result_debates.append({
                "id": debate.id,
                "user_id": debate.user_id,
                "topic": debate.topic,
                "questions": debate.questions,
                "logs": debate.logs,
                "winner": debate.winner,
                "is_public": debate.is_public,
                "created_at": debate.created_at,
                "updated_at": debate.updated_at,
                "like_count": like_count,
                "is_liked_by_user": is_liked_by_user,
                "creator_name": creator_name,
            })
        
        total_pages = (total_count + per_page - 1) // per_page
        
        response_data = GetPublicDebatesResponse().dump({
            "debates": result_debates,
            "total_count": total_count,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        })
        
        return web.json_response(response_data)


@docs(
    tags=["debate visibility"],
    summary="Toggle debate visibility",
    description="Makes a debate public or private.",
    responses={
        200: {
            "schema": ToggleDebateVisibilityResponse,
            "description": "Success response with updated visibility",
        },
        403: {"description": "Access denied"},
        404: {"description": "Debate not found"},
        422: {"description": "Validation error"},
    },
)
@request_schema(ToggleDebateVisibilityRequest)
async def toggle_debate_visibility_view(request) -> web.Response:
    user_id = request["user_id"]
    data = request["data"]
    debate_id = data["debate_id"]
    is_public = data["is_public"]
    
    async with async_session() as session:
        debate = await get_item_by_id(session, debate_id, db_models.Debate)
        if not debate:
            return web.json_response({"error": "Debate not found"}, status=404)
        
        # Only the debate creator can change visibility
        if debate.user_id != user_id:
            return web.json_response({"error": "Access denied"}, status=403)
        
        # Only completed debates can be made public
        if is_public and not debate.winner:
            return web.json_response({"error": "Only completed debates can be made public"}, status=400)
        
        await update_item(session, debate_id, {"is_public": is_public}, db_models.Debate)
        
        response_data = ToggleDebateVisibilityResponse().dump({
            "message": f"Debate {'made public' if is_public else 'made private'}",
            "is_public": is_public,
        })
        
        return web.json_response(response_data)


@docs(
    tags=["debate likes"],
    summary="Toggle like on a debate",
    description="Likes or unlikes a public debate.",
    responses={
        200: {
            "schema": ToggleLikeResponse,
            "description": "Success response with like status",
        },
        404: {"description": "Debate not found"},
        422: {"description": "Validation error"},
    },
)
@request_schema(ToggleLikeRequest)
async def toggle_like_view(request) -> web.Response:
    user_id = request["user_id"]
    data = request["data"]
    debate_id = data["debate_id"]
    
    async with async_session() as session:
        debate = await get_item_by_id(session, debate_id, db_models.Debate)
        if not debate:
            return web.json_response({"error": "Debate not found"}, status=404)
        
        # Only public debates can be liked
        if not debate.is_public:
            return web.json_response({"error": "Cannot like private debates"}, status=400)
        
        # Check if user already liked this debate
        existing_like = await session.scalar(
            select(db_models.UserLike).where(
                db_models.UserLike.debate_id == debate_id,
                db_models.UserLike.user_id == user_id
            )
        )
        
        if existing_like:
            # Unlike
            await session.delete(existing_like)
            is_liked = False
        else:
            # Like
            await create_item(session, {
                "user_id": user_id,
                "debate_id": debate_id
            }, db_models.UserLike)
            is_liked = True
        
        await session.commit()
        
        # Get updated like count
        like_count = await session.scalar(
            select(func.count(db_models.UserLike.id)).where(
                db_models.UserLike.debate_id == debate_id
            )
        )
        
        response_data = ToggleLikeResponse().dump({
            "message": f"Debate {'liked' if is_liked else 'unliked'}",
            "is_liked": is_liked,
            "like_count": like_count,
        })
        
        return web.json_response(response_data)
