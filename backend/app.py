import os
import io
import pygame
import fitz # PyMuPDF
import sqlite3
import uuid
import json
import datetime
from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from google.cloud import texttospeech, speech
import google.auth
import traceback

try:
    from llm import query_gemini, extract_name_from_resume, generate_interview_report
except ImportError:
    print("❌ CRITICAL ERROR: Could not import from 'llm.py'.")
    query_gemini = None

# --- Init ---
TTS_CLIENT_INITIALIZED = False
STT_CLIENT_INITIALIZED = False
tts_client = None
stt_client = None

try:
    tts_client = texttospeech.TextToSpeechClient()
    TTS_CLIENT_INITIALIZED = True
except Exception as e: print(f"TTS Error: {e}")

try:
    stt_client = speech.SpeechClient()
    STT_CLIENT_INITIALIZED = True
except Exception as e: print(f"STT Error: {e}")

try: pygame.mixer.init()
except Exception as e: pass

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://localhost:3001"]}})

# --- DATABASE SETUP ---
DB_NAME = "interview_system.db"
VIDEO_UPLOAD_FOLDER = "video_uploads" # New folder for videos
os.makedirs(VIDEO_UPLOAD_FOLDER, exist_ok=True)

def init_db():
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                access_key TEXT PRIMARY KEY,
                created_at TEXT,
                user_name TEXT,
                role TEXT,
                duration_minutes INTEGER,
                status TEXT DEFAULT 'pending', 
                transcript TEXT,
                video_filename TEXT
            )
        ''')
        conn.commit()

init_db()

# --- ENDPOINTS ---
@app.route("/api/upload_video", methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({"error": "No video part"}), 400
    
    file = request.files['video']
    access_key = request.form.get('key')
    
    if not file or not access_key:
        return jsonify({"error": "Missing file or key"}), 400

    filename = f"{access_key}_{int(datetime.datetime.now().timestamp())}.webm"
    save_path = os.path.join(VIDEO_UPLOAD_FOLDER, filename)
    
    try:
        file.save(save_path)
        
        with sqlite3.connect(DB_NAME) as conn:
            conn.execute(
                "UPDATE sessions SET video_filename=? WHERE access_key=?",
                (filename, access_key)
            )
        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        print(f"Video upload failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/videos/<filename>", methods=['GET'])
def serve_video(filename):
    return send_from_directory(VIDEO_UPLOAD_FOLDER, filename)

@app.route("/api/test", methods=['GET'])
def test_endpoint():
    return jsonify({"message": "Backend Online"})

# --- ADMIN ENDPOINTS ---

@app.route("/api/admin/generate_key", methods=['POST'])
def generate_key():
    key = str(uuid.uuid4())[:8] 
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.execute(
                "INSERT INTO sessions (access_key, created_at, status) VALUES (?, ?, ?)",
                (key, datetime.datetime.now().isoformat(), 'pending')
            )
        return jsonify({"key": key})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/report/<key>", methods=['GET'])
def get_report(key):
    try:
        transcript_json = None
        role = "Candidate"
        video_filename = None
        
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.execute("SELECT transcript, role, video_filename FROM sessions WHERE access_key = ?", (key,))
            row = cursor.fetchone()
            if not row: return jsonify({"error": "Key not found"}), 404
            
            transcript_raw = row[0]
            role = row[1] if row[1] else "Candidate"
            video_filename = row[2] # Fetch video filename
            
            if transcript_raw:
                transcript_json = json.loads(transcript_raw)

        if not transcript_json:
            return jsonify({"error": "No interview data found."}), 400

        # Generate report using LLM (existing logic)
        report_json_str = generate_interview_report(transcript_json, role)
        
        try:
            report_data = json.loads(report_json_str)
        except:
            report_data = {"raw_text": report_json_str}
            
        # Append video URL to the response
        if video_filename:
            report_data["video_url"] = f"http://localhost:5000/api/videos/{video_filename}"

        return jsonify(report_data)
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/all_keys", methods=['GET'])
def get_all_keys():
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM sessions ORDER BY created_at DESC")
            rows = [dict(row) for row in cursor.fetchall()]
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- EVALUATION ENDPOINTS ---

@app.route("/api/verify_key", methods=['POST'])
def verify_key():
    data = request.get_json()
    key = data.get('key')
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.execute("SELECT status FROM sessions WHERE access_key = ?", (key,))
        row = cursor.fetchone()
        if not row: return jsonify({"valid": False, "message": "Invalid Key"}), 404
        if row[0] == 'completed': return jsonify({"valid": False, "message": "Interview already completed"}), 400
        
        return jsonify({"valid": True})

@app.route("/api/start_evaluation", methods=['POST'])
def start_evaluation():
    data = request.get_json()
    key = data.get('key')
    name = data.get('user_name')
    role = data.get('role')
    duration = data.get('duration')

    with sqlite3.connect(DB_NAME) as conn:
        conn.execute(
            "UPDATE sessions SET user_name=?, role=?, duration_minutes=?, status='in_progress' WHERE access_key=?",
            (name, role, duration, key)
        )
    return jsonify({"success": True})

@app.route("/api/submit_interview", methods=['POST'])
def submit_interview():
    data = request.get_json()
    key = data.get('key')
    history = data.get('history')
    
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute(
            "UPDATE sessions SET transcript=?, status='completed' WHERE access_key=?",
            (json.dumps(history), key)
        )
    return jsonify({"success": True})

# --- UPLOAD RESUME ---
@app.route("/api/upload_resume", methods=['POST'])
def upload_resume_api():
    if 'file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if not file or file.filename == '': return jsonify({"error": "No selected file"}), 400

    if file.filename.endswith('.pdf'):
        try:
            resume_text = ""
            pdf_bytes = file.read()
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                for page in doc: resume_text += page.get_text("text")
            
            extracted_name = ""
            if extract_name_from_resume:
                extracted_name = extract_name_from_resume(resume_text)

            return jsonify({"resume_text": resume_text, "extracted_name": extracted_name})
        except Exception as e:
            return jsonify({"error": f"Error processing PDF: {e}"}), 500
    return jsonify({"error": "Invalid file type"}), 400

# --- CHAT ---
@app.route("/api/chat", methods=['POST'])
def chat_api():
    if query_gemini is None: return jsonify({"error": "Chat unavailable."}), 500
    data = request.get_json()
    
    history = data.get('history')
    mode = data.get('mode', 'resume')
    role = data.get('role')
    skills = data.get('skills')
    resume_text = data.get('resumeText')
    user_name = data.get('user_name')
    time_left_mins = data.get('time_left_mins') # NEW

    if not isinstance(history, list): return jsonify({"error": "'history' must be list"}), 400
    
    try:
        llm_reply = query_gemini(history, mode, role, skills, resume_text, user_name, time_left_mins)
        return jsonify({"reply": llm_reply})
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": "Internal chat error."}), 500

# --- TTS/STT ---
@app.route("/api/stt", methods=['POST'])
def speech_to_text_api():
    if not STT_CLIENT_INITIALIZED: return jsonify({"error": "STT unavailable."}), 503
    if 'audio_blob' not in request.files: return jsonify({"error": "No audio data"}), 400
    audio_file = request.files['audio_blob']
    
    try:
        audio_content = audio_file.read()
        audio = speech.RecognitionAudio(content=audio_content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            language_code="en-US",
            enable_automatic_punctuation=True,
            model="latest_long",
            use_enhanced=True
        )
        response = stt_client.recognize(config=config, audio=audio)
        transcript = ""
        if response.results:
            transcript = response.results[0].alternatives[0].transcript
        return jsonify({"transcript": transcript})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tts", methods=['POST'])
def text_to_speech_api():
    if not TTS_CLIENT_INITIALIZED: return jsonify({"error": "TTS unavailable."}), 503
    data = request.get_json()
    text_to_speak = data.get('text')
    
    audio_bytes = synthesize_speech_bytes(text_to_speak)
    if audio_bytes:
        return send_file(io.BytesIO(audio_bytes), mimetype='audio/mpeg', download_name='response.mp3')
    return jsonify({"error": "Failed to synthesize"}), 500

def synthesize_speech_bytes(text: str) -> bytes | None:
    if not TTS_CLIENT_INITIALIZED: return None
    try:
        print(f"   🎙️ DEBUG: Attempting to use Voice: 'en-US-Journey-D'") 
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(language_code="en-US", name="en-US-Journey-D")
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        response = tts_client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
        return response.audio_content
    except Exception as e:
        print(f"   ⚠️ Journey Voice failed ({e}). Falling back...")
        try:
            voice = texttospeech.VoiceSelectionParams(language_code="en-US", name="en-US-Neural2-D")
            response = tts_client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
            return response.audio_content
        except Exception:
            return None

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)