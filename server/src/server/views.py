from aiohttp import web
from google import genai  # Assuming genai client calls are synchronous
import logging
from .utils import (
    start_chat,
    send_chat_message,
    generate_text_content,
)
from .schemas import (
    StartDebateRequest,
    StartDebateResponse,
    ProcessTurnRequest,
    ProcessTurnResponse,
    ClosingArgmentRequest,
    ClosingArgmentResponse,
    JudgeDebateResponse,
    JudgeDebateRequest,
)
from aiohttp_apispec import (
    docs,
    request_schema,
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
async def start_debate_view(request):
    logger.info("Starting debate...")
    debate_state = request.app["debate_state"]
    api_key = request.app["api_key"]
    text_model_name = request.app["text_model_name"]
    max_sentences = request.app["max_sentences"]

    data = request["data"]

    topic = data["topic"]
    if not topic:
        return web.json_response({"error": "Topic is required"}, status=400)

    # Reset debate state for a new debate
    debate_state["topic"] = topic
    debate_state["moderator_history"] = []
    debate_state["pro_llm_history"] = []
    debate_state["con_llm_history"] = []
    debate_state["current_turn"] = "pro"
    debate_state["debate_log"] = []
    debate_state["questions"] = []

    # Re-initialize clients and chats
    debate_state["clients"]["pro"]["client"] = genai.Client(api_key=api_key)
    debate_state["clients"]["con"]["client"] = genai.Client(api_key=api_key)
    debate_state["clients"]["moderator"]["client"] = genai.Client(api_key=api_key)

    initial_prompt = f"Debate topic: {topic}. Pro side will argue in favor, Con side will argue against. I, the moderator will manage the debate."
    pro_client = debate_state["clients"]["pro"]["client"]
    con_client = debate_state["clients"]["con"]["client"]

    pro_side_chat = start_chat(
        pro_client,
        system_instructions=f"{initial_prompt} You are on the pro side of a debate. Your goal is to argue for the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
    )
    debate_state["clients"]["pro"]["chat"] = pro_side_chat
    con_side_chat = start_chat(
        con_client,
        system_instructions=f"{initial_prompt} You are on the con side of a debate. Your goal is to argue against the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {max_sentences} sentences. Do not include any other information.",
        model=text_model_name,
    )
    debate_state["clients"]["con"]["chat"] = con_side_chat

    # These genai calls are synchronous. In a high-performance async app,
    # you'd want async equivalents or run them in a thread pool executor.
    pro_side_response = pro_side_chat.send_message(
        f"Opening statement for the debate topic: {topic}"
    ).text
    con_side_response = con_side_chat.send_message(
        f"Opening statement for the debate topic: {topic}"
    ).text

    debate_state["debate_log"].append(
        {
            "speaker": "moderator",
            "response_type": "opening_statement",
            "text": initial_prompt,
        }
    )
    debate_state["debate_log"].append(
        {
            "speaker": "pro",
            "response_type": "opening_statement",
            "text": pro_side_response,
        }
    )
    debate_state["debate_log"].append(
        {
            "speaker": "con",
            "response_type": "opening_statement",
            "text": con_side_response,
        }
    )
    response_data = StartDebateResponse().dump(
        {
            "message": "Debate started",
            "topic": topic,
            "pro_initial": pro_side_response,
            "con_initial": con_side_response,
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
async def process_turn_view(request):
    debate_state = request.app["debate_state"]
    max_sentences = request.app["max_sentences"]

    data = request["data"]
    question = data["question"]

    if not debate_state["topic"]:
        return web.json_response({"error": "Debate not started"}, status=400)

    pro_client_chat = debate_state["clients"]["pro"]["chat"]
    con_client_chat = debate_state["clients"]["con"]["chat"]

    if not pro_client_chat or not con_client_chat:
        return web.json_response(
            {"error": "Chat not initialized. Start debate first."}, status=400
        )

    debate_state["questions"].append(question)

    pro_side_response = send_chat_message(
        pro_client_chat,
        f"Respond to the question in favour of: {question}. Provide your argument in {max_sentences} sentences.",
    ).text
    con_side_response = send_chat_message(
        con_client_chat,
        f"Respond to the question in opposition to: {question}. Provide your argument in {max_sentences} sentences.",
    ).text
    debate_state["debate_log"].append(
        {
            "speaker": "moderator",
            "response_type": "intitial_question_response",  # Note: "initial" was misspelled
            "text": question,
        }
    )
    debate_state["debate_log"].append(
        {
            "speaker": "pro",
            "response_type": "intitial_question_response",  # Note: "initial" was misspelled
            "text": pro_side_response,
        }
    )
    # Added this missing log for con side's initial response to the question
    debate_state["debate_log"].append(
        {
            "speaker": "con",
            "response_type": "intitial_question_response",  # Note: "initial" was misspelled
            "text": con_side_response,
        }
    )
    pro_side_rebuttal = send_chat_message(
        pro_client_chat,
        f"Rebuttal to the con side's argument: {con_side_response}. Provide your rebuttal in {max_sentences} sentences.",
    ).text
    con_side_rebuttal = send_chat_message(
        con_client_chat,
        f"Rebuttal to the pro side's argument: {pro_side_response}. Provide your rebuttal in {max_sentences} sentences.",
    ).text
    debate_state["debate_log"].append(
        {
            "speaker": "pro",
            "response_type": "rebuttal",
            "text": pro_side_rebuttal,
        }
    )
    debate_state["debate_log"].append(
        {
            "speaker": "con",
            "response_type": "rebuttal",
            "text": con_side_rebuttal,
        }
    )
    response_data = ProcessTurnResponse().dump(
        {
            "message": "Turn processed",
            "question": question,
            "pro_side_response": pro_side_response,
            "con_side_response": con_side_response,
            "pro_side_rebuttal": pro_side_rebuttal,
            "con_side_rebuttal": con_side_rebuttal,
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
async def closing_arguments_view(request):
    debate_state = request.app["debate_state"]
    max_sentences = request.app["max_sentences"]

    if not debate_state["topic"]:
        return web.json_response({"error": "Debate not started"}, status=400)

    pro_client_chat = debate_state["clients"]["pro"]["chat"]
    con_client_chat = debate_state["clients"]["con"]["chat"]

    if not pro_client_chat or not con_client_chat:
        return web.json_response(
            {"error": "Chat not initialized. Start debate first."}, status=400
        )

    pro_closing = send_chat_message(
        pro_client_chat,
        f"Provide your closing argument for the debate in {max_sentences} sentences.",
    ).text

    con_closing = send_chat_message(
        con_client_chat,
        f"Provide your closing argument for the debate in {max_sentences} sentences.",
    ).text

    debate_state["debate_log"].append(
        {
            "speaker": "pro",
            "response_type": "closing_argument",
            "text": pro_closing,
        }
    )
    debate_state["debate_log"].append(
        {
            "speaker": "con",
            "response_type": "closing_argument",
            "text": con_closing,
        }
    )
    response_data = ClosingArgmentResponse().dump(
        {
            "message": "Closing arguments processed",
            "pro_closing": pro_closing,
            "con_closing": con_closing,
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
async def judge_debate_view(request):
    debate_state = request.app["debate_state"]
    api_key = request.app["api_key"]  # Moderator client uses this directly if re-init

    if not debate_state["topic"]:
        return web.json_response({"error": "Debate not started"}, status=400)

    # Ensure moderator client is available
    moderator_client = debate_state["clients"]["moderator"]["client"]
    if not moderator_client:
        # Re-initialize if it somehow got lost, though it should persist if debate_state does
        moderator_client = genai.Client(api_key=api_key)
        debate_state["clients"]["moderator"]["client"] = moderator_client

    judgment_prompt = f"Based on the debate about {debate_state['topic']}, provide a final judgment on who won the debate. Consider all arguments and rebuttals. Give one word answer: 'pro' or 'con'. Here is the transcript of the debate: {debate_state['debate_log']}"

    judgment = (
        generate_text_content(
            moderator_client,  # Pass the client instance
            judgment_prompt,
            system_instructions="You are a debate judge. Analyze the debate transcript and provide a final judgment on who won the debate.",
        )
        .text.strip()
        .lower()
    )

    if judgment not in ["pro", "con"]:
        # Fallback or refine judgment if LLM gives more than one word
        if "pro" in judgment:
            judgment = "pro"
        elif "con" in judgment:
            judgment = "con"
        else:
            # If still not pro/con, this indicates an issue with the LLM's adherence to the prompt
            return web.json_response(
                {
                    "error": f"Invalid judgment received from model: {judgment}. Expected 'pro' or 'con'."
                },
                status=500,
            )

    debate_state["debate_log"].append(
        {
            "speaker": "moderator",
            "response_type": "judgment",
            "text": f"Judgment: The winner is {judgment}.",
        }
    )
    logger.info(f"Debate judged: {judgment}")
    response_data = JudgeDebateResponse().dump(
        {
            "message": "Debate judged",
            "judgment": judgment,
        }
    )

    return web.json_response(response_data)
