from google import genai
from google.genai.types import Content, GenerateContentResponse
from google.genai.chats import AsyncChats
import os
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

load_dotenv()

# Encryption helpers for API keys
_GEMINI_KEY_SECRET = os.environ.get("GEMINI_KEY_SECRET")
if _GEMINI_KEY_SECRET is None:
    raise RuntimeError(
        "GEMINI_KEY_SECRET environment variable must be set for API key encryption."
    )
fernet = Fernet(_GEMINI_KEY_SECRET.encode())


def encrypt_api_key(api_key: str) -> str:
    return fernet.encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    try:
        return fernet.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        raise ValueError("Invalid encrypted API key or wrong secret.")


async def send_chat_message(chat: AsyncChats, message: str) -> GenerateContentResponse:
    response = await chat.send_message(message)
    return response


def start_chat(
    client,
    system_instructions: str,
    model: str,
    history: list[dict] = [],
) -> AsyncChats:
    if history:
        history = [Content(**item) for item in history]
    chat = client.aio.chats.create(
        model=model,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_instructions
        ),
        history=history,
    )
    return chat


async def generate_text_content(
    client: genai.Client,
    text: str,
    system_instructions: str,
    model_name: str,
    max_output_tokens: int = 100,
) -> GenerateContentResponse:
    question_response = await client.aio.models.generate_content(
        model=model_name,
        contents=[text],
        config=genai.types.GenerateContentConfig(
            max_output_tokens=max_output_tokens,
            system_instruction=system_instructions,
        ),
    )
    return question_response
