# backend/app.py

import os
import io
import pygame
import fitz # PyMuPDF
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from google.cloud import texttospeech, speech
import google.auth
import traceback

# --- ✅ Import BOTH functions ---
try:
    from llm import query_gemini, extract_name_from_resume
except ImportError:
    print("❌ CRITICAL ERROR: Could not import from 'llm.py'.")
    query_gemini = None
    extract_name_from_resume = None

# --- Configuration & Initialization ---
# (TTS/STT/Pygame init - unchanged)
TTS_CLIENT_INITIALIZED = False
STT_CLIENT_INITIALIZED = False
tts_client = None
stt_client = None
try:
    print("Initializing TTS Client...")
    tts_client = texttospeech.TextToSpeechClient()
    tts_client.list_voices(language_code="en-US")
    TTS_CLIENT_INITIALIZED = True
    print("✅ TTS Client initialized.")
except Exception as e: print(f"❌ ERROR initializing TTS: {e}")
try:
    print("Initializing STT Client...")
    stt_client = speech.SpeechClient()
    STT_CLIENT_INITIALIZED = True
    print("✅ STT Client initialized.")
except Exception as e: print(f"❌ ERROR initializing STT: {e}")
try: pygame.mixer.init(); print("✅ Pygame Mixer initialized.")
except Exception as e: print(f"⚠️ Warning initializing Pygame Mixer: {e}")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://localhost:3001"]}})
print("✅ CORS enabled.")

# --- /api/test (unchanged) ---
@app.route("/api/test", methods=['GET'])
def test_endpoint():
    print("\n--- ✅ /api/test endpoint was hit! ---")
    tts_status = "Initialized" if TTS_CLIENT_INITIALIZED else "NOT Initialized"
    stt_status = "Initialized" if STT_CLIENT_INITIALIZED else "NOT Initialized"
    return jsonify({"message": "Backend connection successful!", "tts_status": tts_status, "stt_status": stt_status })


# --- ✅ CORRECTED /api/upload_resume ---
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

            # --- CALL NAME EXTRACTION ---
            extracted_name = ""
            if extract_name_from_resume:
                print("   Attempting to extract name...")
                try:
                    # Make sure the function is actually called
                    extracted_name = extract_name_from_resume(resume_text)
                    print(f"   Successfully extracted name: '{extracted_name}'")
                except Exception as e:
                    print(f"    ⚠️ Warning: Name extraction failed: {e}")
                    # Optionally log traceback: print(traceback.format_exc())
            else:
                 print("    ⚠️ Warning: 'extract_name_from_resume' function not available/imported.")
            # --- END NAME EXTRACTION CALL ---

            # Return both pieces of data
            return jsonify({
                "resume_text": resume_text,
                "extracted_name": extracted_name
            })

        except Exception as e:
            print(f"   ❌ Error processing PDF: {e}")
            print(traceback.format_exc()) # Log full error for PDF issues
            return jsonify({"error": f"Error processing PDF: {e}"}), 500
    else:
        print(f"   ❌ Error: Invalid file type '{file.filename}'.")
        return jsonify({"error": "Invalid file type, please upload a PDF"}), 400

# --- /api/chat (unchanged) ---
@app.route("/api/chat", methods=['POST'])
def chat_api():
    print("\n--- >>> /api/chat endpoint was hit! <<< ---")
    if query_gemini is None: return jsonify({"error": "Chat unavailable."}), 500
    data = request.get_json()
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    print(f"   Received keys: {list(data.keys())}")
    history = data.get('history'); mode = data.get('mode', 'resume'); role = data.get('role')
    skills = data.get('skills'); resume_text = data.get('resumeText'); user_name = data.get('user_name') # Corrected key
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

# --- /api/stt (unchanged) ---
@app.route("/api/stt", methods=['POST'])
def speech_to_text_api():
    # ... (code unchanged)
    print("\n--- Received /api/stt request ---")
    if not STT_CLIENT_INITIALIZED or stt_client is None: return jsonify({"error": "STT unavailable."}), 503
    if 'audio_blob' not in request.files: return jsonify({"error": "No audio data"}), 400
    audio_file = request.files['audio_blob']
    if not audio_file or not audio_file.filename: return jsonify({"error": "Invalid audio data"}), 400
    try:
        print(f"   Received audio: {audio_file.filename}, Type: {audio_file.content_type}")
        audio_content = audio_file.read()
        if not audio_content: return jsonify({"error": "Empty audio content"}), 400
        audio = speech.RecognitionAudio(content=audio_content)
        config = speech.RecognitionConfig( encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS, audio_channel_count=2, language_code="en-US", enable_automatic_punctuation=True, model="latest_long", use_enhanced=True )
        print(f"   Using STT Config: encoding=WEBM_OPUS, channels=2, lang={config.language_code}, model={config.model}, enhanced={config.use_enhanced}")
        response = stt_client.recognize(config=config, audio=audio)
        transcript = ""; confidence = 0
        if response.results:
            best_alternative = response.results[0].alternatives[0]
            transcript = best_alternative.transcript; confidence = best_alternative.confidence
            print(f"   Transcription: '{transcript}' (Confidence: {confidence:.2f})")
        else: print("   Warning: STT API returned no results.")
        return jsonify({"transcript": transcript, "confidence": confidence})
    except google.api_core.exceptions.InvalidArgument as e:
        print(f"   ❌ STT InvalidArgument: {e}")
        return jsonify({"error": f"Invalid config or audio data."}), 400
    except Exception as e:
        print(f"   ❌ STT Error: {type(e).__name__} - {e}")
        return jsonify({"error": f"Failed to transcribe ({type(e).__name__})."}), 500

# --- /api/tts (unchanged) ---
@app.route("/api/tts", methods=['POST'])
def text_to_speech_api():
    # ... (code unchanged)
    print("\n--- Received /api/tts request ---")
    if not TTS_CLIENT_INITIALIZED or tts_client is None: return jsonify({"error": "TTS unavailable."}), 503
    data = request.get_json();
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    text_to_speak = data.get('text')
    if not text_to_speak or not isinstance(text_to_speak, str) or text_to_speak.strip() == "": return jsonify({"error": "No valid text"}), 400
    print(f"   Requesting speech for: '{text_to_speak[:60]}...'")
    audio_bytes = synthesize_speech_bytes(text_to_speak)
    if audio_bytes:
        audio_stream = io.BytesIO(audio_bytes)
        print("   Sending synthesized audio bytes.")
        return send_file(audio_stream, mimetype='audio/mpeg', as_attachment=False, download_name='response.mp3')
    else:
        print("   ❌ Error: Failed to synthesize speech.")
        return jsonify({"error": "Failed to synthesize speech."}), 500

# --- synthesize_speech_bytes (unchanged) ---
def synthesize_speech_bytes(text: str) -> bytes | None:
    # ... (code unchanged)
    if not TTS_CLIENT_INITIALIZED or tts_client is None: return None
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(language_code="en-IN", name="en-IN-Wavenet-B")
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.0)
        response = tts_client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
        return response.audio_content
    except Exception as e:
        print(f"   ❌ TTS API Error: {type(e).__name__} - {e}")
        return None

# --- Main (unchanged) ---
if __name__ == '__main__':
    # ... (code unchanged)
    print("\n--- Starting Flask Development Server ---")
    print(f"   TTS Initialized: {TTS_CLIENT_INITIALIZED}")
    print(f"   STT Initialized: {STT_CLIENT_INITIALIZED}")
    if query_gemini: print("   Vertex AI status logged in llm.py.")
    else: print("   ⚠️ LLM functions failed to import.")
    print("   Backend: http://localhost:5000")
    try:
        app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
    except Exception as e: print(f"❌ Failed to start Flask server: {e}")