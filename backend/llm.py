import os
import vertexai
from vertexai.generative_models import (
    GenerativeModel,
    HarmCategory,
    HarmBlockThreshold
)
import google.auth
import sys
import re
import traceback
import json

# --- Configuration & Initialization ---
VERTEX_AI_INITIALIZED = False
PROJECT_ID = None
MODEL_INITIALIZED = False
GEMINI_MODEL = "gemini-2.5-flash-lite"
model = None 

def initialize_vertex_ai():
    global VERTEX_AI_INITIALIZED, PROJECT_ID, MODEL_INITIALIZED, model
    if VERTEX_AI_INITIALIZED:
        return True

    try:
        print("Attempting to initialize Vertex AI...")
        credentials, detected_project_id = google.auth.default()
        PROJECT_ID = detected_project_id
        vertexai.init(project=PROJECT_ID, location="us-central1")
        print(f"✅ Vertex AI initialized successfully for project: {PROJECT_ID}")
        VERTEX_AI_INITIALIZED = True

        try:
            print(f"Initializing GenerativeModel (check): {GEMINI_MODEL}")
            model_check = GenerativeModel(GEMINI_MODEL)
            MODEL_INITIALIZED = True
            print(f"✅ GenerativeModel '{GEMINI_MODEL}' name seems valid.")
        except Exception as model_e:
            print(f"❌ ERROR: Could not initialize the GenerativeModel '{GEMINI_MODEL}' during check.")
            print(f"   Details: {type(model_e).__name__} - {model_e}")
            MODEL_INITIALIZED = False 
        return True
    except google.auth.exceptions.DefaultCredentialsError:
        print(f"❌ CRITICAL ERROR: Could not find Google Cloud credentials.")
        print(f"   Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly.")
        PROJECT_ID = None; VERTEX_AI_INITIALIZED = False; return False
    except Exception as e:
        print(f"❌ CRITICAL ERROR: Could not initialize Vertex AI.")
        print(f"   Details: {type(e).__name__} - {e}")
        PROJECT_ID = None; VERTEX_AI_INITIALIZED = False; return False

initialize_vertex_ai()

# --- Helper Functions ---

def get_system_prompt(
    mode: str,
    role: str = None,
    skills: str = None,
    user_name: str = None, 
    resume_text: str = None,
    time_left_mins: float = None 
) -> str | None:
    """
    Generates a high-quality system prompt with TIME AWARENESS.
    """
    try:
        # --- NAME LOGIC ---
        if user_name:
             first_name = user_name.split(' ')[0]
             name_to_use = first_name
        else:
             name_to_use = "Candidate"
        
        # --- ROLE CONTEXT ---
        role_context = role if role else "Software Engineer"
        skills_context = skills if skills else "General technical skills"

        # --- RESUME HANDLING ---
        resume_block = ""
        if mode == "resume" and resume_text:
            trunc_resume = resume_text[:4000] 
            resume_block = f"""
            **CANDIDATE RESUME:**
            ---
            {trunc_resume}
            ---
            """
            mission_start = f"Your first task is to greet {name_to_use} and mention a specific detail from their resume to break the ice."
        else:
            mission_start = f"Your first task is to greet {name_to_use} and ask them to tell you about themselves."

        # --- TIME AWARENESS LOGIC ---
        time_instruction = ""
        if time_left_mins is not None:
            if time_left_mins <= 0.5:
                 time_instruction = "🚨 TIME IS UP. The interview is over. You MUST strictly say: 'Thank you very much for your time. We have all the data we need. Have a great day.' and stop asking questions."
            elif time_left_mins < 3:
                 time_instruction = f"⚠️ TIME CRITICAL: There are only {int(time_left_mins)} minutes left. Do NOT start a new deep technical topic. Ask one final short wrap-up question or begin concluding the interview."
            else:
                 time_instruction = f"Time Remaining: {int(time_left_mins)} minutes. Pace yourself comfortably."

        # --- CORE PERSONA ---
        base_prompt = f"""
        **ROLE:** 
        You are Alex, a Senior Engineering Manager at a top-tier tech company. You are conducting an evaluation interview with {name_to_use} for the position of {role_context}.

        **OBJECTIVE:**
        Evaluate {name_to_use}'s suitability based on skills: {skills_context}.

        **TIME STATUS:**
        {time_instruction}

        **INTERVIEW GUIDELINES (FOLLOW STRICTLY):**
        1.  **Start:** {mission_start}
        2.  **One Question at a Time:** NEVER ask multiple questions in one turn. Wait for the candidate to answer.
        3.  **Conciseness:** Keep your responses concise (2-4 sentences max). Do not monologue.
        4.  **Dig Deeper:** If the answer is vague, ask for a specific example using the STAR method.
        5.  **End:** When the interview is over (based on time or natural conclusion), say: "good bye, thank you for your time, we will get back to you"

        {resume_block}
        """

        return base_prompt.strip()

    except Exception as e:
        print(f"❌ Error generating system prompt: {e}")
        return None


def query_gemini(
    history: list,
    mode: str,
    role: str = None,
    skills: str = None,
    resume_text: str = None,
    user_name: str = None,
    time_left_mins: float = None 
) -> str:

    if not VERTEX_AI_INITIALIZED: return "Error: Vertex AI failed to initialize..."
    if not MODEL_INITIALIZED: return "Error: AI Model name invalid or failed initial check..."

    print(f"Interviewer (Gemini) thinking... (Mode: {mode}, Role: {role}, Name: {user_name}, TimeLeft: {time_left_mins})")

    # History translation loop
    gemini_history = []
    for msg in history:
        speaker = msg.get('speaker')
        text = msg.get('text', '').strip()
        if text:
            if speaker == 'alex': 
                gemini_history.append({"role": "model", "parts": [{"text": text}]})
            elif speaker == 'user':
                gemini_history.append({"role": "user", "parts": [{"text": text}]})

    # Get system prompt
    system_prompt_text = get_system_prompt(mode, role, skills, user_name, resume_text, time_left_mins)
    if not system_prompt_text: return "Error: Could not generate interview context..."

    try:
        current_model = GenerativeModel(GEMINI_MODEL, system_instruction=[system_prompt_text])
    except Exception as e:
        print(f"Error initializing model for request: {e}")
        return "Error: Could not configure AI model for this request."

    safety_settings = { cat: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE for cat in HarmCategory }

    try:
        if not gemini_history:
            contents_to_send = [{"role": "user", "parts": [{"text": "Start the interview."}]}]
        else:
            contents_to_send = gemini_history

        response = current_model.generate_content(
            contents=contents_to_send,
            generation_config={"temperature": 0.7, "max_output_tokens": 300}, 
            safety_settings=safety_settings
        )

        if hasattr(response, 'text') and response.text:
            return response.text.strip()
        else:
            return "My response was empty. Please try again."

    except Exception as e:
        print(f"❌ An error occurred during Gemini content generation: {type(e).__name__} - {e}")
        error_message = f"An error occurred while contacting the AI ({type(e).__name__})."
        if "quota" in str(e).lower(): error_message = "API Quota Exceeded..."
        return error_message

# --- REPORT GENERATION ---
def generate_interview_report(transcript_history: list, role: str) -> str:
    """
    Takes the chat history and generates a JSON report.
    """
    if not VERTEX_AI_INITIALIZED: return json.dumps({"error": "AI not initialized"})

    print("📊 Generating Interview Report...")
    
    conversation_text = ""
    for msg in transcript_history:
        conversation_text += f"{msg['speaker'].upper()}: {msg['text']}\n"

    prompt = f"""
    You are an Expert Technical Recruiter and Engineering Director.
    Review the following interview transcript for the role of {role}.

    **TRANSCRIPT:**
    {conversation_text}

    **TASK:**
    Analyze ONLY the candidate's answers (User). Ignore the initial greeting.
    For every significant question asked by Alex and answered by User, provide:
    1. The Question Summary.
    2. The User's Answer Summary.
    3. A "Rating" (1-10).
    4. "Feedback": What was missing?
    5. "Better Answer": A specific example of how a senior engineer would have answered.

    **OUTPUT FORMAT:**
    You MUST respond with valid JSON only. Do not add markdown ticks (```json).
    Structure:
    {{
        "overall_score": 8,
        "summary": "Candidate was strong in X but weak in Y...",
        "qa_analysis": [
            {{
                "question": "...",
                "user_answer": "...",
                "rating": 7,
                "feedback": "...",
                "better_answer": "..."
            }}
        ]
    }}
    """

    try:
        # Use the same model for reporting
        report_model = GenerativeModel(GEMINI_MODEL)
        response = report_model.generate_content(
            [prompt],
            generation_config={"temperature": 0.4, "response_mime_type": "application/json"} 
        )
        return response.text.strip()
    except Exception as e:
        print(f"Report Gen Error: {e}")
        return json.dumps({"error": f"Failed to generate report: {str(e)}"})

def extract_name_from_resume(resume_text: str) -> str:
    if not VERTEX_AI_INITIALIZED: return ""
    if not MODEL_INITIALIZED: return ""

    text_to_scan = resume_text[:1500] 
    try:
        system_prompt = "You are an expert resume parser. Extract the candidate's full name. Respond ONLY with the full name."
        user_content = f"TEXT:\n---\n{text_to_scan}\n---"
        extraction_model = GenerativeModel(GEMINI_MODEL, system_instruction=[system_prompt])
        response = extraction_model.generate_content([user_content], generation_config={"temperature": 0.0})
        if hasattr(response, 'text') and response.text:
            name = response.text.strip()
            name = re.sub(r"^\*?\s*Name:\s*", "", name, flags=re.IGNORECASE)
            return name.strip()
        return ""
    except Exception:
        return ""