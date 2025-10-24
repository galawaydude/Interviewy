# backend/app.py

import os
import io
import pygame
import fitz  # PyMuPDF
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from google.cloud import texttospeech

# --- Import our new GEMINI function ---
from llm import query_gemini

# --- Configuration ---
try:
    # This automatically finds your GOOGLE_APPLICATION_CREDENTIALS
    tts_client = texttospeech.TextToSpeechClient()
    pygame.mixer.init()
    print("✅ Google TTS/STT Client and Pygame Mixer initialized.")
except Exception as e:
    print(f"❌ CRITICAL ERROR: Could not initialize Google Cloud. Is GOOGLE_APPLICATION_CREDENTIALS set?")
    print(e)

app = Flask(__name__)
# Allow your frontend (localhost:3000) to call all /api/ routes
CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})


# --- Resume Upload Endpoint ---
@app.route("/api/upload_resume", methods=['POST'])
def upload_resume_api():
    """
    API endpoint to upload a PDF resume.
    Extracts the text and returns it as JSON.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and file.filename.endswith('.pdf'):
        try:
            resume_text = ""
            # Read the file's bytes into memory
            pdf_bytes = file.read()
            # Open the PDF from memory
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                for page in doc:
                    resume_text += page.get_text()
            
            print(f"Successfully parsed resume: {file.filename}")
            # Send the extracted text back to the frontend
            return jsonify({"resume_text": resume_text})
        
        except Exception as e:
            print(f"Error parsing PDF: {e}")
            return jsonify({"error": f"Error parsing PDF: {e}"}), 500
    
    return jsonify({"error": "Invalid file type, please upload a PDF"}), 400


# --- Chat Endpoint ---
@app.route("/api/chat", methods=['POST'])
def chat_api():
    """
    API endpoint for the text chat.
    Returns a single JSON object with the complete reply.
    """
    data = request.get_json()
    history = data.get('history')
    mode = data.get('mode', 'resume')
    role = data.get('role')
    skills = data.get('skills')
    resume_text = data.get('resume_text') # Get the resume text

    # Check if history is None (missing), but allow an empty list []
    if history is None:
        return jsonify({"error": "No history provided"}), 400
    
    # --- Call the new query_gemini function ---
    llm_reply = query_gemini(history, mode, role, skills, resume_text)
    
    return jsonify({"reply": llm_reply})


# --- TTS Endpoint ---
@app.route("/api/tts", methods=['POST'])
def text_to_speech_api():
    """
    API endpoint to convert text to speech.
    (This is ready for when you re-enable the voice features)
    """
    data = request.get_json()
    text_to_speak = data.get('text')
    if not text_to_speak:
        return jsonify({"error": "No text provided"}), 400

    print(f"Frontend requested speech for: '{text_to_speak}'")
    audio_bytes = synthesize_speech_bytes(text_to_speak)

    if audio_bytes:
        audio_stream = io.BytesIO(audio_bytes)
        return send_file(
            audio_stream,
            mimetype='audio/mpeg',
            as_attachment=False,
            download_name='response.mp3'
        )
    else:
        return jsonify({"error": "Failed to speech"}), 500

# --- TTS Helper ---
def synthesize_speech_bytes(text: str):
    """Helper function to synthesize audio bytes"""
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(language_code="en-IN", name="en-IN-Wavenet-B")
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.05)
        response = tts_client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
        return response.audio_content
    except Exception as e:
        print(f"Error during TTS synthesis: {e}")
        return None

# --- Main ---
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)