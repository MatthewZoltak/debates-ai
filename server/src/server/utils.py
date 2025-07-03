from google import genai
from google.genai.types import Content


def send_chat_message(chat, message: str):
    response = chat.send_message(message)
    return response


def start_chat(
    client,
    system_instructions: str,
    model: str,
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
    model_name: str,
    max_output_tokens: int = 100,
) -> genai.types.GenerateContentResponse:
    question_response = client.models.generate_content(
        model=model_name,
        contents=[text],
        config=genai.types.GenerateContentConfig(
            max_output_tokens=max_output_tokens,
            system_instruction=system_instructions,
        ),
    )
    return question_response
