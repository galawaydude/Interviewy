# backend/app.py

import os
import io
import pygame
import fitz # PyMuPDF
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS # Import CORS
from google.cloud import texttospeech
import google.auth # Import google.auth for specific exception handling
import traceback # For detailed error logging

# --- Import the LLM function ---
# Ensure llm.py is in the same directory
try:
    from llm import query_gemini
except ImportError:
    print("❌ CRITICAL ERROR: Could not import 'query_gemini' from 'llm.py'. Ensure the file exists.")
    query_gemini = None # Define as None to prevent NameError later

# --- Configuration & Initialization ---
TTS_CLIENT_INITIALIZED = False
tts_client = None # Define tts_client globally
try:
    print("Attempting to initialize Google Cloud TTS Client...")
    tts_client = texttospeech.TextToSpeechClient()
    # Perform a lightweight check (e.g., list voices with a small limit) to confirm API access/billing
    print("   Checking TTS API access by listing voices...")
    tts_client.list_voices(language_code="en-US") # Simple check
    print("✅ Google TTS Client initialized and API accessible.")
    TTS_CLIENT_INITIALIZED = True
except google.auth.exceptions.DefaultCredentialsError:
    print("❌ CONFIGURATION ERROR: Could not find Google Cloud credentials.")
    print("   Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly.")
except Exception as e:
    print(f"❌ ERROR: Could not initialize or verify Google Cloud TTS Client.")
    # Add hints based on common errors
    error_str = str(e).lower()
    if "billing account" in error_str or "billing disabled" in error_str:
        print("   Reason: Billing may be disabled or not properly linked to the project.")
    elif "permission denied" in error_str:
         print("   Reason: Permission Denied. Ensure the Service Account has necessary permissions (e.g., roles/cloudtts.serviceAgent or Editor).")
    elif "api not enabled" in error_str or "has not been used" in error_str or "method requires billing" in error_str:
         print("   Reason: Text-to-Speech API might not be enabled, or billing is required/disabled.")
         print("   Visit: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com")
    else:
        print(f"   Details: {type(e).__name__} - {e}")

# Initialize Pygame Mixer
try:
    pygame.mixer.init()
    print("✅ Pygame Mixer initialized.")
except Exception as e:
    print(f"⚠️ Warning: Could not initialize Pygame Mixer: {e}")

app = Flask(__name__)
# Allow frontend origins (adjust ports if necessary)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://localhost:3001"]}})
print("✅ CORS enabled for http://localhost:3000 and http://localhost:3001.")


# --- Simple Test Endpoint ---
@app.route("/api/test", methods=['GET'])
def test_endpoint():
    print("\n--- ✅ /api/test endpoint was hit! ---")
    # Also test TTS initialization status here
    tts_status = "Initialized" if TTS_CLIENT_INITIALIZED else "NOT Initialized"
    return jsonify({"message": "Backend connection successful!", "tts_status": tts_status})

# --- Resume Upload Endpoint ---
@app.route("/api/upload_resume", methods=['POST'])
def upload_resume_api():
    print("\n--- Received /api/upload_resume request ---")
    if 'file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if not file or file.filename == '': return jsonify({"error": "No selected file"}), 400
    if file.filename.endswith('.pdf'):
        try:
            resume_text = ""
            pdf_bytes = file.read()
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                for page in doc: resume_text += page.get_text("text")
            print(f"   Successfully parsed resume: {file.filename} ({len(resume_text)} chars)")
            return jsonify({"resume_text": resume_text})
        except Exception as e:
            print(f"   ❌ Error parsing PDF: {e}")
            return jsonify({"error": f"Error processing PDF: {e}"}), 500
    else:
        print(f"   ❌ Error: Invalid file type '{file.filename}'. Only PDF allowed.")
        return jsonify({"error": "Invalid file type, please upload a PDF"}), 400

# --- Chat Endpoint ---
@app.route("/api/chat", methods=['POST'])
def chat_api():
    print("\n--- >>> /api/chat endpoint was hit! <<< ---")
    if query_gemini is None:
        print("❌ Error: query_gemini function not available (Import failed).")
        return jsonify({"error": "Chat functionality is unavailable due to an import error."}), 500

    data = request.get_json()
    if not data:
        print("❌ Error: Received empty or invalid JSON payload.")
        return jsonify({"error": "Invalid JSON payload"}), 400
    # Log only keys to avoid printing large resume text
    print(f"   Received data keys: {list(data.keys())}")

    history = data.get('history')
    mode = data.get('mode', 'resume')
    role = data.get('role')
    skills = data.get('skills')
    resume_text = data.get('resume_text')
    user_name = data.get('user_name')

    # --- Validation ---
    if not isinstance(history, list):
        print("❌ Error: 'history' not provided or not a list.")
        return jsonify({"error": "'history' must be a list"}), 400
    if not history and (not user_name or not isinstance(user_name, str) or user_name.strip() == ""):
         print("❌ Error: 'user_name' is missing or empty on the initial call with empty history.")
         return jsonify({"error": "User name is required to start the interview"}), 400

    # --- Call LLM ---
    try:
        print("   Attempting to call query_gemini...")
        llm_reply = query_gemini(history, mode, role, skills, resume_text, user_name)
        # Check if llm_reply indicates an error occurred within query_gemini
        if isinstance(llm_reply, str) and llm_reply.startswith("Error:"):
             print(f"   query_gemini returned an error: {llm_reply}")
             # Return a user-friendly error, maybe map specific errors later
             return jsonify({"error": "Failed to get response from AI. Check backend logs."}), 500
        print(f"   Gemini reply generated successfully.")
        return jsonify({"reply": llm_reply})
    except Exception as e:
        print(f"❌ Unexpected Error during query_gemini execution:")
        print(traceback.format_exc()) # Print full traceback for debugging
        return jsonify({"error": "An critical internal error occurred processing the chat request. Check backend logs."}), 500

# --- TTS Endpoint ---
@app.route("/api/tts", methods=['POST'])
def text_to_speech_api():
    print("\n--- Received /api/tts request ---")
    if not TTS_CLIENT_INITIALIZED or tts_client is None: # Check client exists
         print("   ❌ Error: TTS client not initialized, cannot synthesize speech.")
         return jsonify({"error": "Text-to-Speech service is not available."}), 503 # Service Unavailable

    data = request.get_json()
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    text_to_speak = data.get('text')
    if not text_to_speak or not isinstance(text_to_speak, str) or text_to_speak.strip() == "":
        print("   ❌ Error: No valid text provided for TTS.")
        return jsonify({"error": "No valid text provided for speech synthesis"}), 400

    print(f"   Requesting speech for: '{text_to_speak[:60]}...'")
    audio_bytes = synthesize_speech_bytes(text_to_speak)
    if audio_bytes:
        audio_stream = io.BytesIO(audio_bytes)
        print("   Sending synthesized audio bytes.")
        return send_file(audio_stream, mimetype='audio/mpeg', as_attachment=False, download_name='response.mp3')
    else:
        print("   ❌ Error: Failed to synthesize speech (helper returned None).")
        return jsonify({"error": "Failed to synthesize speech due to an internal error."}), 500

# --- TTS Helper ---
def synthesize_speech_bytes(text: str) -> bytes | None:
    """Helper function to synthesize audio bytes using Google TTS"""
    if not TTS_CLIENT_INITIALIZED or tts_client is None:
         print("   ❌ Error in synthesize_speech_bytes: TTS client not available.")
         return None
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)

        # --- ⭐️ USING WAVENET VOICE FOR BETTER QUALITY ⭐️ ---
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-IN",
            name="en-IN-Wavenet-B" # Male WaveNet voice
            # You can also try:
            # name="en-IN-Wavenet-D"  # Male WaveNet voice (alternative)
            # name="en-IN-Neural2-A" # Female Neural2 voice (often very natural)
            # name="en-IN-Neural2-D" # Male Neural2 voice
        )
        # --- ⭐️ END VOICE SELECTION ⭐️ ---

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3, # MP3 is efficient
            speaking_rate=1.0 # Adjust slightly if needed (e.g., 1.05 for a bit faster)
            # pitch=0.0 # Adjust pitch if needed (-20 to 20)
        )
        print("   Calling Google TTS synthesize_speech API...")
        response = tts_client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )
        print(f"   TTS synthesis successful ({len(response.audio_content)} bytes).")
        return response.audio_content
    except Exception as e:
        print(f"   ❌ Error during TTS API call: {type(e).__name__} - {e}")
        # Log specific details for Google API errors
        if hasattr(e, 'details'):
             print(f"      API Error Details: {e.details()}")
        return None

# --- Main ---
if __name__ == '__main__':
    print("\n--- Starting Flask Development Server ---")
    print("   Ensure GOOGLE_APPLICATION_CREDENTIALS is set correctly.")
    print(f"   TTS Initialized: {TTS_CLIENT_INITIALIZED}")
    # Initialize Vertex AI from llm.py when Flask starts
    if query_gemini: # Check if import succeeded
        print("   Vertex AI initialization status logged in llm.py.")
    else:
        print("   ⚠️ LLM function 'query_gemini' failed to import.")
    print("   Access frontend at: http://localhost:3000 (or other port)")
    print("   Backend listening on: http://localhost:5000")
    print("   Press CTRL+C to quit.")
    try:
        # use_reloader=False prevents double initialization logs in debug mode
        # but means you might need to manually restart server for some code changes (like imports)
        app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
    except Exception as e:
         print(f"❌ Failed to start Flask server: {e}")