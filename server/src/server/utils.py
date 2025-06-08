from google import genai
from google.genai.types import Content
from dotenv import load_dotenv
import os

load_dotenv()
TEXT_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.0-flash")


def send_chat_message(chat, message: str):
    response = chat.send_message(message)
    return response


def start_chat(
    client,
    system_instructions: str,
    model: str = TEXT_MODEL_NAME,
    history: list[dict] = [],
):
    if history:
        history = [Content(**item) for item in history]
    chat = client.chats.create(
        model=model,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_instructions
        ),
        history=history,
    )
    return chat


def generate_text_content(
    client: genai.Client,
    text: str,
    system_instructions: str,
    max_output_tokens: int = 100,
) -> genai.types.GenerateContentResponse:
    question_response = client.models.generate_content(
        model=TEXT_MODEL_NAME,
        contents=[text],
        config=genai.types.GenerateContentConfig(
            max_output_tokens=max_output_tokens,
            system_instruction=system_instructions,
        ),
    )
    return question_response
