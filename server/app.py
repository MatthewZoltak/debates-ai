from flask import Flask, request, jsonify
from flask_cors import CORS # Import CORS
from google import genai
import os
import dotenv
from utils import start_chat, send_chat_message

dotenv.load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})
MAX_SENTENCES = 2

# Configure your API keys (store securely, e.g., in .env or environment variables)
API_KEY = os.environ.get("GEMINI_API_KEY")
TEXT_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.0-flash")

# --- Global state for simplicity in this example. In a real app, use a proper session/DB ---
debate_state = {
    "topic": None,
    "clients": {
        "pro": {
            "client": genai.Client(api_key=API_KEY),
            "chat": None, # Will be initialized later
            "voice": "Kore", # Default voice for pro side
        },
        "con": {
            "client": genai.Client(api_key=API_KEY),
            "chat": None, # Will be initialized later
            "voice": "Sadaltager", # Default voice for con side
        },
        "moderator": {
            "client": genai.Client(api_key=API_KEY),
            "voice": "Zephyr", # Default voice for moderator
        }
    },
    "moderator_history": [], # Moderator messages
    "pro_llm_history": [],
    "con_llm_history": [],
    "current_turn": "pro", # "pro", "con", "moderator"
    "debate_log": [], # Stores [{speaker: "pro/con/mod", text: "...", audio_b64: "..."}]
    "questions": []
}

@app.route('/start_debate', methods=['POST'])
def start_debate():
    data = request.json
    topic = data.get('topic')
    if not topic:
        return jsonify({"error": "Topic is required"}), 400

    initial_prompt = f"Debate topic: {topic}. Pro side will argue in favor, Con side will argue against. I, the moderator will manage the debate."
    pro_client = debate_state["clients"]["pro"]["client"]
    con_client = debate_state["clients"]["con"]["client"]

    pro_side_chat = start_chat(
        pro_client,
        system_instructions=f"{initial_prompt} You are on the pro side of a debate. Your goal is to argue for the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {MAX_SENTENCES} sentences. Do not include any other information.",
        model=TEXT_MODEL_NAME
    )
    debate_state["clients"]["pro"]["chat"] = pro_side_chat
    con_side_chat = start_chat(
        con_client,
        system_instructions=f"{initial_prompt} You are on the con side of a debate. Your goal is to argue against the topic. Be logical and persuasive. Respond to the opposing side's arguments. Only ever respond with {MAX_SENTENCES} sentences. Do not include any other information.",
        model=TEXT_MODEL_NAME
    )
    debate_state["clients"]["con"]["chat"] = con_side_chat
    moderator_voice = debate_state["clients"]["moderator"]["voice"]
    pro_side_voice = debate_state["clients"]["pro"]["voice"]
    con_side_voice = debate_state["clients"]["con"]["voice"]


    debate_state["topic"] = topic
    pro_side_response = pro_side_chat.send_message(f"Opening statement for the debate topic: {topic}").text
    con_side_response = con_side_chat.send_message(f"Opening statement for the debate topic: {topic}").text
    debate_state["debate_log"].append({
        "speaker": "moderator",
        "response_type":"opening_statement",
        "text": initial_prompt,
    })
    debate_state["debate_log"].append({
        "speaker": "pro",
        "response_type":"opening_statement",
        "text": pro_side_response,
    })
    debate_state["debate_log"].append({
        "speaker": "con",
        "response_type":"opening_statement",
        "text": con_side_response,
    })
    return jsonify({
        "message": "Debate started",
        "topic": topic,
        "pro_initial": pro_side_response,
        "con_initial": con_side_response,
        "pro_voice": pro_side_voice,
        "con_voice": con_side_voice,
        "moderator_voice": moderator_voice
    })




@app.route('/process_turn', methods=['POST'])
def process_turn():
    data = request.json
    question = data.get('question')
    if not question:
        return jsonify({"error": "Question is required"}), 400

    if not debate_state["topic"]:
        return jsonify({"error": "Debate not started"}), 400
    
    pro_client_chat = debate_state["clients"]["pro"]["chat"]
    con_client_chat = debate_state["clients"]["con"]["chat"]

    # generate_and_play_audio(moderator_client, initial_prompt, voice_name=debate_state["clients"]["moderator"]["voice"])
    debate_state["questions"].append(question)

    pro_side_response = send_chat_message(
        pro_client_chat,
        f"Respond to the question in favour of: {question}. Provide your argument in {MAX_SENTENCES} sentences."
    ).text
    con_side_response = send_chat_message(
        con_client_chat,
        f"Respond to the question in opposition to: {question}. Provide your argument in {MAX_SENTENCES} sentences."
    ).text
    debate_state["debate_log"].append({
        "speaker": "moderator",
        "response_type":"intitial_question_response",
        "text": question,
    })
    debate_state["debate_log"].append({
        "speaker": "pro",
        "response_type":"intitial_question_response",
        "text": pro_side_response,
    })
    pro_side_rebuttal = send_chat_message(
        pro_client_chat,
        f"Rebuttal to the con side's argument: {con_side_response}. Provide your rebuttal in {MAX_SENTENCES} sentences."
    ).text
    con_side_rebuttal = send_chat_message(
        con_client_chat,
        f"Rebuttal to the pro side's argument: {pro_side_response}. Provide your rebuttal in {MAX_SENTENCES} sentences."
    ).text
    debate_state["debate_log"].append({
        "speaker": "pro",
        "response_type":"rebuttal",
        "text": pro_side_rebuttal,
    })
    debate_state["debate_log"].append({
        "speaker": "con",
        "response_type":"rebuttal",
        "text": con_side_rebuttal,
    })
    return jsonify({
        "message": "Turn processed",
        "question": question,
        "pro_side_response": pro_side_response,
        "con_side_response": con_side_response,
        "pro_side_rebuttal": pro_side_rebuttal,
        "con_side_rebuttal": con_side_rebuttal,
    })
    
@app.route('/closing_arguments', methods=['POST'])
def closing_arguments():
    if not debate_state["topic"]:
        return jsonify({"error": "Debate not started"}), 400

    pro_client_chat = debate_state["clients"]["pro"]["chat"]
    con_client_chat = debate_state["clients"]["con"]["chat"]

    pro_closing = send_chat_message(
        pro_client_chat,
        f"Provide your closing argument for the debate in {MAX_SENTENCES} sentences."
    ).text

    con_closing = send_chat_message(
        con_client_chat,
        f"Provide your closing argument for the debate in {MAX_SENTENCES} sentences."
    ).text

    debate_state["debate_log"].append({
        "speaker": "pro",
        "response_type":"closing_argument",
        "text": pro_closing,
    })
    debate_state["debate_log"].append({
        "speaker": "con",
        "response_type":"closing_argument",
        "text": con_closing,
    })

    return jsonify({
        "message": "Closing arguments processed",
        "pro_closing": pro_closing,
        "con_closing": con_closing,
    })

@app.route('/judge_debate', methods=['POST'])
def judge_debate():
    if not debate_state["topic"]:
        return jsonify({"error": "Debate not started"}), 400


    # Generate a final judgment based on the debate
    judgment = send_chat_message(
        debate_state["clients"]["moderator"]["client"],
        f"Based on the debate about {debate_state['topic']}, provide a final judgment on who won the debate. Consider all arguments and rebuttals. Give one word answer: 'pro' or 'con'. Here is the transcript of the debate: {debate_state['debate_log']}"
    ).text

    if judgment.lower() not in ['pro', 'con']:
        return jsonify({"error": "Invalid judgment. Must be 'pro' or 'con'."}), 500

    return jsonify({
        "message": "Debate judged",
        "judgment": judgment,
    })

# Simple root route for testing
@app.route('/')
def index():
    return "Debate AI Backend Running!"

if __name__ == '__main__':
    app.run(debug=True)
