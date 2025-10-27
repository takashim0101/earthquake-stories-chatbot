# generate_response.py
"""
This script runs a Flask web server to generate empathetic responses for the chatbot.

It exposes a /generate_response endpoint that accepts a user message and a story sentiment,
then uses a Large Language Model (LLM) to generate a supportive and context-aware response.
"""

import os
import json
import requests
import time
from dotenv import load_dotenv
from flask import Flask, request, jsonify

# Load environment variables from .env file
load_dotenv()

# --- Flask App Initialization ---
app = Flask(__name__)

# --- Configuration ---
# LM Studio API settings from .env file
LM_STUDIO_API = os.getenv("LM_STUDIO_API")
MODEL = os.getenv("MODEL")

# We don't need to load all stories into memory for this service,
# as the sentiment will be passed in the API request.

def generate_empathetic_response(user_message, story_sentiment, max_retries=3):
    """
    Generates an empathetic response using an LLM.
    
    Args:
        user_message (str): The user's input message.
        story_sentiment (str): The sentiment ('positive', 'negative', 'neutral') of a related story.
        max_retries (int): The maximum number of times to retry the API call.
    
    Returns:
        str: The generated empathetic response, or a fallback message on failure.
    """
    
    # 1. Define the persona and instructions
    system_prompt = "You are Hope, an empathetic AI assistant for earthquake survivors. Your role is to listen, show understanding, and offer gentle support. Do not give medical or structural advice. Keep your responses concise (1-2 sentences)."
    
    # 2. Create a dynamic prompt based on sentiment
    if story_sentiment == 'negative':
        instruction = "The user is sharing a difficult experience. Respond with extra compassion and validation."
    elif story_sentiment == 'positive':
        instruction = "The user is sharing a hopeful or positive experience. Share in their feeling of relief or hope."
    else: # neutral
        instruction = "The user is sharing a factual or neutral experience. Respond in a gentle, listening manner."

    user_prompt = f"{instruction}\n\nUser's message: \"{user_message}\"\n\nYour supportive response:"

    # 3. Combine for the final prompt (Mistral-style)
    full_prompt = system_prompt + "\n\n" + user_prompt

    # 4. Construct the payload
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "user", "content": full_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 100
    }

    # 5. Call the API with retry logic
    for attempt in range(max_retries):
        try:
            response = requests.post(LM_STUDIO_API, json=payload, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            if content:
                return content.strip()
            else:
                raise Exception("LLM returned an empty response.")

        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = 2**(attempt + 1)
                print(f"⚠️ Error contacting LM Studio API (Attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"❌ LM Studio API failed after {max_retries} attempts: {e}")
                return "I'm sorry, I'm having a little trouble connecting right now. Please know that I'm here to listen."
        except Exception as e:
            print(f"❌ An unexpected error occurred: {e}")
            return "I'm sorry, something went wrong on my end. Thank you for your patience."
    
    return "I'm sorry, I couldn't generate a response. Please try again later."

@app.route("/generate_response", methods=["POST"])
def handle_generate_response():
    """
    Flask route to handle response generation requests.
    Expects a JSON body with 'user_message' and 'story_sentiment'.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    user_message = data.get("user_message")
    story_sentiment = data.get("story_sentiment")

    if not user_message or not story_sentiment:
        return jsonify({"error": "Missing 'user_message' or 'story_sentiment' in request body"}), 400

    print(f"--- Received request to generate response for sentiment: {story_sentiment} ---")
    
    response_text = generate_empathetic_response(user_message, story_sentiment)
    
    print(f"--- Generated response: {response_text} ---")

    return jsonify({"response": response_text})

if __name__ == '__main__':
    # Run the Flask app on port 5002, which is different from the geocoding API (5001)
    print("Starting empathetic response generation server on http://127.0.0.1:5002")
    app.run(port=5002, debug=True)
