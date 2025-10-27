# backend/app.py

import os
import io
import pygame
import fitz # PyMuPDF
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS # Import CORS
# --- Import Google Cloud Speech & TextToSpeech ---
from google.cloud import texttospeech, speech # Added speech
import google.auth # Import google.auth for specific exception handling
import traceback # For detailed error logging

# --- ✅ 1. IMPORT BOTH FUNCTIONS ---
try:
    from llm import query_gemini, extract_name_from_resume
except ImportError:
    print("❌ CRITICAL ERROR: Could not import from 'llm.py'. Ensure the file exists.")
    query_gemini = None
    extract_name_from_resume = None

# --- Configuration & Initialization ---
# (This section is unchanged)
TTS_CLIENT_INITIALIZED = False
STT_CLIENT_INITIALIZED = False
tts_client = None
stt_client = None

try:
    print("Attempting to initialize Google Cloud TTS Client...")
    tts_client = texttospeech.TextToSpeechClient()
    tts_client.list_voices(language_code="en-US")
    print("✅ Google TTS Client initialized and API accessible.")
    TTS_CLIENT_INITIALIZED = True
except google.auth.exceptions.DefaultCredentialsError:
    print("❌ CONFIGURATION ERROR: Could not find Google Cloud credentials for TTS.")
    print("   Ensure GOOGLE_APPLICATION_CREDENTIALS is set correctly.")
except Exception as e:
    print(f"❌ ERROR: Could not initialize or verify Google Cloud TTS Client.")
    print(f"   Details: {type(e).__name__} - {e}")

try:
    print("Attempting to initialize Google Cloud STT Client...")
    stt_client = speech.SpeechClient()
    print("✅ Google STT Client initialized.")
    STT_CLIENT_INITIALIZED = True
except google.auth.exceptions.DefaultCredentialsError:
    print("❌ CONFIGURATION ERROR: Could not find Google Cloud credentials for STT.")
    print("   Ensure GOOGLE_APPLICATION_CREDENTIALS is set correctly.")
except Exception as e:
    print(f"❌ ERROR: Could not initialize Google Cloud STT Client.")
    print(f"   Details: {type(e).__name__} - {e}")

try:
    pygame.mixer.init()
    print("✅ Pygame Mixer initialized.")
except Exception as e:
    print(f"⚠️ Warning: Could not initialize Pygame Mixer: {e}")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://localhost:3001"]}})
print("✅ CORS enabled for http://localhost:3000 and http://localhost:3001.")


# --- Simple Test Endpoint ---
@app.route("/api/test", methods=['GET'])
def test_endpoint():
    print("\n--- ✅ /api/test endpoint was hit! ---")
    tts_status = "Initialized" if TTS_CLIENT_INITIALIZED else "NOT Initialized"
    stt_status = "Initialized" if STT_CLIENT_INITIALIZED else "NOT Initialized"
    return jsonify({"message": "Backend connection successful!", "tts_status": tts_status, "stt_status": stt_status })

# --- ✅ 2. THIS IS THE FULLY CORRECTED UPLOAD FUNCTION ---
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
            print(f"   Successfully parsed resume: {file.filename}")

            # --- THIS BLOCK WAS MISSING FROM YOUR VERSION ---
            extracted_name = ""
            if extract_name_from_resume:
                print("   Attempting to extract name...")
                try:
                    extracted_name = extract_name_from_resume(resume_text)
                    # This log was missing from your terminal output
                    print(f"   Successfully extracted name: '{extracted_name}'")
                except Exception as e:
                    print(f"    ⚠️ Warning: Name extraction failed: {e}")
            else:
                 print("    ⚠️ Warning: 'extract_name_from_resume' not available.")
            # --- END OF MISSING BLOCK ---
            
            return jsonify({
                "resume_text": resume_text,
                "extracted_name": extracted_name
            })
            
        except Exception as e:
            print(f"   ❌ Error parsing PDF: {e}")
            return jsonify({"error": f"Error processing PDF: {e}"}), 500
    else:
        print(f"   ❌ Error: Invalid file type '{file.filename}'.")
        return jsonify({"error": "Invalid file type, please upload a PDF"}), 400

# --- ✅ 3. THIS IS THE CORRECTED CHAT API ---
@app.route("/api/chat", methods=['POST'])
def chat_api():
    print("\n--- >>> /api/chat endpoint was hit! <<< ---")
    if query_gemini is None: return jsonify({"error": "Chat unavailable."}), 500
    data = request.get_json()
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    print(f"   Received keys: {list(data.keys())}")
    history = data.get('history'); mode = data.get('mode', 'resume'); role = data.get('role')
    
    # --- Fixed resume_text -> resumeText ---
    skills = data.get('skills'); resume_text = data.get('resumeText'); user_name = data.get('user_name')

    if not isinstance(history, list): return jsonify({"error": "'history' must be list"}), 400
    if not history and (not user_name or not isinstance(user_name, str) or user_name.strip() == ""):
           return jsonify({"error": "User name required for first turn"}), 400
    try:
        llm_reply = query_gemini(history, mode, role, skills, resume_text, user_name)
        if isinstance(llm_reply, str) and llm_reply.startswith("Error:"):
             return jsonify({"error": "AI Error. Check logs."}), 500
        print(f"   Gemini reply generated successfully.")
        return jsonify({"reply": llm_reply})
    except Exception as e:
        print(f"❌ Error during query_gemini:"); print(traceback.format_exc())
        return jsonify({"error": "Internal chat error. Check logs."}), 500

# --- Speech-to-Text (STT) Endpoint ---
# (This section is unchanged)
@app.route("/api/stt", methods=['POST'])
def speech_to_text_api():
    print("\n--- Received /api/stt request ---")
    if not STT_CLIENT_INITIALIZED or stt_client is None:
        print("   ❌ Error: STT client not initialized.")
        return jsonify({"error": "Speech-to-Text service unavailable."}), 503

    if 'audio_blob' not in request.files:
        print("   ❌ Error: No 'audio_blob' file part.")
        return jsonify({"error": "No audio data received"}), 400

    audio_file = request.files['audio_blob']
    if not audio_file or not audio_file.filename :
        print("   ❌ Error: 'audio_blob' file part empty/invalid.")
        return jsonify({"error": "Empty or invalid audio data received"}), 400

    try:
        print(f"   Received audio: {audio_file.filename}, Content-Type: {audio_file.content_type}")
        audio_content = audio_file.read()
        if not audio_content:
            print("   ❌ Error: Audio file content is empty.")
            return jsonify({"error": "Received empty audio file content"}), 400

        audio = speech.RecognitionAudio(content=audio_content)

        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            audio_channel_count=2,
            language_code="en-US",
            enable_automatic_punctuation=True,
            model="latest_long", 
            use_enhanced=True,   
        )
        print(f"   Using STT Config: encoding=WEBM_OPUS, channels=2, lang={config.language_code}, model={config.model}, enhanced={config.use_enhanced}")


        print("   Calling Google STT recognize API...")
        response = stt_client.recognize(config=config, audio=audio)
        print("   STT API call completed.")

        transcript = ""
        confidence = 0
        if response.results:
            best_alternative = response.results[0].alternatives[0]
            transcript = best_alternative.transcript
            confidence = best_alternative.confidence
            print(f"   Transcription: '{transcript}' (Confidence: {confidence:.2f})")
        else:
            print("   Warning: STT API returned no results (silence/unintelligible?).")

        return jsonify({"transcript": transcript, "confidence": confidence})

    except google.api_core.exceptions.InvalidArgument as e:
        print(f"   ❌ Error during STT processing (InvalidArgument): {e}")
        error_str = str(e).lower()
        if "audio_channel_count" in error_str: print("   Hint: Audio channel mismatch.")
        elif "sample_rate" in error_str: print("   Hint: Sample rate issue.")
        elif "encoding" in error_str: print("   Hint: Encoding mismatch (Expected WEBM_OPUS).")
        elif "model" in error_str and "not supported" in error_str: print(f"   Hint: The model '{config.model}' might not support the specified encoding/language/enhancements.")
        else: print(f"   Hint: Check audio data format and RecognitionConfig parameters.")
        return jsonify({"error": f"Failed to transcribe: Invalid config or audio data."}), 400
    except Exception as e:
        print(f"   ❌ Error during STT processing: {type(e).__name__} - {e}")
        error_str = str(e).lower()
        if "billing" in error_str: print("   Hint: Check Billing.")
        elif "permission denied" in error_str: print("   Hint: Check Permissions.")
        elif "api not enabled" in error_str: print("   Hint: Check API Enabled status.")
        return jsonify({"error": f"Failed to transcribe audio ({type(e).__name__}). Check logs."}), 500


# --- TTS Endpoint ---
# (This section is unchanged)
@app.route("/api/tts", methods=['POST'])
def text_to_speech_api():
    print("\n--- Received /api/tts request ---")
    if not TTS_CLIENT_INITIALIZED or tts_client is None: return jsonify({"error": "TTS service unavailable."}), 503
    data = request.get_json();
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    text_to_speak = data.get('text')
    if not text_to_speak or not isinstance(text_to_speak, str) or text_to_speak.strip() == "": return jsonify({"error": "No valid text provided"}), 400
    print(f"   Requesting speech for: '{text_to_speak[:60]}...'")
    audio_bytes = synthesize_speech_bytes(text_to_speak)
    if audio_bytes:
        audio_stream = io.BytesIO(audio_bytes)
        print("   Sending synthesized audio bytes.")
        return send_file(audio_stream, mimetype='audio/mpeg', as_attachment=False, download_name='response.mp3')
    else:
        print("   ❌ Error: Failed to synthesize speech.")
        return jsonify({"error": "Failed to synthesize speech."}), 500

# --- TTS Helper (Using WaveNet) ---
def synthesize_speech_bytes(text: str) -> bytes | None:
    if not TTS_CLIENT_INITIALIZED or tts_client is None: return None
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(language_code="en-IN", name="en-IN-Wavenet-B")
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.0)
        response = tts_client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
        return response.audio_content
    except Exception as e:
        print(f"   ❌ Error during TTS API call: {type(e).__name__} - {e}")
        return None

# --- Main ---
if __name__ == '__main__':
    print("\n--- Starting Flask Development Server ---")
    print("   Ensure GOOGLE_APPLICATION_CREDENTIALS is set.")
    print(f"   TTS Initialized: {TTS_CLIENT_INITIALIZED}")
    print(f"   STT Initialized: {STT_CLIENT_INITIALIZED}")
    if query_gemini: print("   Vertex AI initialization status logged in llm.py.")
    else: print("   ⚠️ LLM function 'query_gemini' failed to import.")
    print("   Frontend: http://localhost:3000 (or other port)")
    print("   Backend: http://localhost:5000")
    print("   Press CTRL+C to quit.")
    try:
        app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
    except Exception as e:
        print(f"❌ Failed to start Flask server: {e}")