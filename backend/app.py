# backend/app.py

import os
import io
import pygame
import fitz
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from google.cloud import texttospeech
from llm import query_ollama

# --- Configuration ---
try:
    tts_client = texttospeech.TextToSpeechClient()
    pygame.mixer.init()
    print("Google TTS Client and Pygame Mixer initialized successfully.")
except Exception as e:
    print(f"CRITICAL ERROR: Could not initialize Google Cloud. Error: {e}")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})


# --- Resume Endpoint ---
@app.route("/api/upload_resume", methods=['POST'])
def upload_resume_api():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and file.filename.endswith('.pdf'):
        try:
            resume_text = ""
            pdf_bytes = file.read()
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                for page in doc:
                    resume_text += page.get_text()
            print(f"Successfully parsed resume: {file.filename}")
            return jsonify({"resume_text": resume_text})
        except Exception as e:
            print(f"Error parsing PDF: {e}")
            return jsonify({"error": f"Error parsing PDF: {e}"}), 500
    return jsonify({"error": "Invalid file type, please upload a PDF"}), 400


# --- Chat Endpoint ---
@app.route("/api/chat", methods=['POST'])
def chat_api():
    data = request.get_json()
    history = data.get('history')
    mode = data.get('mode', 'resume')
    role = data.get('role')
    skills = data.get('skills')
    resume_text = data.get('resume_text') # <-- Get the resume text

    if history is None:
        return jsonify({"error": "No history provided"}), 400
    
    # Pass the resume text to the LLM
    llm_reply = query_ollama(history, mode, role, skills, resume_text)
    
    return jsonify({"reply": llm_reply})


# --- TTS Endpoint ---
@app.route("/api/tts", methods=['POST'])
def text_to_speech_api():
    # (Your existing TTS code is here)
    pass 

# --- TTS Helper ---
def synthesize_speech_bytes(text: str):
    # (Your existing TTS helper is here)
    pass

# --- Main ---
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)