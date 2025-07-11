from aiohttp import web
from google import genai
import logging
from .utils import (
    start_chat,
    send_chat_message,
    generate_text_content,
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
)
from aiohttp_apispec import (
    docs,
    request_schema,
    querystring_schema,
)

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
    api_key = request.app["api_key"]
    text_model_name = request.app["text_model_name"]
    max_sentences = request.app["max_sentences"]

    data = request["data"]
    topic = data["topic"]
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
    async with async_session() as session:
        debate: db_models.Debate = await get_item_by_id(
            session, debate_id, db_models.Debate
        )
    if not debate:
        return web.json_response({"error": "Debate not found"}, status=404)
    response_data = GetDebateResponse().dump(
        {
            "debate_id": debate.id,
            "topic": debate.topic,
            "logs": debate.logs,
            "questions": debate.questions,
            "winner": debate.winner,
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
    response_data = GetUserDebatesResponse().dump(
        {
            "debates": [
                {
                    "id": debate.id,
                    "user_id": debate.user_id,
                    "topic": debate.topic,
                    "questions": debate.questions,
                    "logs": debate.logs,
                    "winner": debate.winner,
                }
                for debate in debates
            ]
        }
    )
    return web.json_response(response_data, status=200)
