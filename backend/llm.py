# backend/llm.py

import os
import vertexai
from vertexai.generative_models import (
    GenerativeModel,
    HarmCategory,
    HarmBlockThreshold,
    Part
)
import google.auth
import sys
import re
import traceback

# --- Configuration & Initialization ---
VERTEX_AI_INITIALIZED = False
PROJECT_ID = None
MODEL_INITIALIZED = False
model = None # Global model instance (used mainly for initialization check now)

def initialize_vertex_ai():
    global VERTEX_AI_INITIALIZED, PROJECT_ID, MODEL_INITIALIZED, model, GEMINI_MODEL
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
            # Initialize global model just to check if the model name is valid on startup
            model_check = GenerativeModel(GEMINI_MODEL)
            MODEL_INITIALIZED = True
            print(f"✅ GenerativeModel '{GEMINI_MODEL}' name seems valid.")
        except Exception as model_e:
            print(f"❌ ERROR: Could not initialize the GenerativeModel '{GEMINI_MODEL}' during check.")
            print(f"   Details: {type(model_e).__name__} - {model_e}")
            MODEL_INITIALIZED = False # Flag that model init might fail later
        return True
    except google.auth.exceptions.DefaultCredentialsError:
        print(f"❌ CRITICAL ERROR: Could not find Google Cloud credentials.")
        print(f"   Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly.")
        PROJECT_ID = None; VERTEX_AI_INITIALIZED = False; return False
    except Exception as e:
        print(f"❌ CRITICAL ERROR: Could not initialize Vertex AI.")
        print(f"   Details: {type(e).__name__} - {e}")
        PROJECT_ID = None; VERTEX_AI_INITIALIZED = False; return False

GEMINI_MODEL = "gemini-2.5-flash-lite"
initialize_vertex_ai()

# --- Helper Functions ---

def get_system_prompt(
    mode: str,
    role: str = None,
    skills: str = None,
    user_name: str = None, # Accept name directly
    resume_text: str = None
) -> str | None:
    """
    Generates the system prompt string based on mode and context.
    Uses only the first name if available.
    """
    try:
        # --- "FIRST NAME" LOGIC ---
        if user_name:
             # Use the first part of the name, or the full name if it has no spaces
             first_name = user_name.split(' ')[0]
             name_to_use = first_name # Use this variable in prompts
        else:
             name_to_use = "the candidate"
        # --- END "FIRST NAME" LOGIC ---

        if mode == "position":
            if not role:
                print("⚠️ Warning: Role not provided for position mode prompt.")
                role = "the specified technical"

            # Use name_to_use (first name)
            base_prompt = f"""
            **CONTEXT:**
            - You are Alex, a professional technical interviewer conducting an interview for the company.
            - You are about to start the interview.

            **MISSION:**
            - Role to interview for: {role}
            - Candidate's name: {name_to_use}
            - Candidate's listed skills: {skills or 'Not specified'}
            - Your first task is to greet the candidate warmly by name, briefly state the role, and ask your first introductory question (e.g., "Tell me about yourself" or "What interests you about this role?"). Example: "Hello {name_to_use}, welcome! We're interviewing for the {role} position today. To start, could you tell me a little bit about yourself and your background?"

            **RULES:**
            1.  **BE PROFESSIONAL & FRIENDLY:** Maintain a positive and engaging tone.
            2.  **NO META-COMMENTARY:** Only output what Alex would say directly to the candidate. Do not add labels like "Alex:" or "(Thinking)".
            3.  **ASK PROBING QUESTIONS:** Based on the candidate's answers, ask relevant follow-up questions to understand their depth of knowledge and experience. Refer back to the listed skills: {skills or 'general technical skills'}.
            4.  **ADJUST DIFFICULTY:** If 'intern' or 'junior' is mentioned in the role ({role}), focus more on fundamentals, projects, and learning ability. For other roles, ask more in-depth, experience-based questions.
            5.  **INTERVIEW FLOW:** Start broad, then dive into technical/behavioral specifics related to the role and skills. Conclude after sufficient evaluation.
            6.  **END PHRASE:** When you decide the interview is complete, you MUST end the conversation using this *exact* phrase and nothing else: "good bye, thank you for your time, we will get back to you"
            """
        elif mode == "resume":
            max_resume_chars = 3500
            if resume_text and len(resume_text) > max_resume_chars:
                print(f"Truncating resume text from {len(resume_text)} to {max_resume_chars} characters.")
                truncated_resume = f"... (resume truncated) ...\n{resume_text[-max_resume_chars:]}"
            else:
                truncated_resume = resume_text or 'No resume provided.'

            # Use name_to_use (first name)
            if not resume_text:
                resume_context_mission = f"Your first task is to greet the candidate by name ({name_to_use}), acknowledge no resume was provided, and ask them to describe their professional experience or projects."
                resume_content_block = "No resume was provided for this candidate."
            else:
                resume_context_mission = f"Your first task is to greet the candidate by name ({name_to_use}) and start the interview based *entirely* on their resume below. Ask an opening question related to their most recent experience or overall profile. Example: 'Hello {name_to_use}. Thanks for providing your resume. Let's start by discussing your most recent role at...'"
                resume_content_block = f"""
                **CANDIDATE'S RESUME (potentially truncated):**
                ---
                {truncated_resume}
                ---
                """

            # Use name_to_use (first name)
            base_prompt = f"""
            **CONTEXT:**
            - You are Alex, a professional interviewer conducting an interview for the company.
            - You are about to start the interview.

            **MISSION:**
            - Candidate's name: {name_to_use}
            - {resume_context_mission}
            - {resume_content_block}

            **RULES:**
            1.  **BE PROFESSIONAL & FRIENDLY:** Maintain a positive and engaging tone.
            2.  **NO META-COMMENTARY:** Only output what Alex would say directly to the candidate. Do not add labels like "Alex:" or "(Thinking)".
            3.  **FOCUS ON RESUME:** Base your questions primarily on the provided resume content. Ask for clarifications, details, and examples related to points on the resume.
            4.  **ASK PROBING QUESTIONS:** Dig deeper into the experiences listed.
            5.  **INTERVIEW FLOW:** Structure the interview logically based on the resume (e.g., chronological, by project). Conclude after sufficient evaluation.
            6.  **END PHRASE:** When you decide the interview is complete, you MUST end the conversation using this *exact* phrase and nothing else: "good bye, thank you for your time, we will get back to you"
            """
        else:
             print(f"⚠️ Warning: Unknown mode '{mode}' provided to get_system_prompt.")
             return None # Unknown mode

        return base_prompt.strip()

    except Exception as e:
        print(f"❌ Error generating system prompt: {e}")
        return None


# --- Main Gemini Function ---
def query_gemini(
    history: list,
    mode: str,
    role: str = None,
    skills: str = None,
    resume_text: str = None,
    user_name: str = None # Full name from frontend
) -> str:

    # Use first name for system prompt, but keep full name for logging
    first_name_for_prompt = user_name.split(' ')[0] if user_name else None

    if not VERTEX_AI_INITIALIZED: return "Error: Vertex AI failed to initialize..."
    # Check if model name was at least deemed valid on startup
    if not MODEL_INITIALIZED: return "Error: AI Model name invalid or failed initial check..."

    print(f"Interviewer (Gemini) thinking... (Mode: {mode}, Role: {role}, Name: {user_name})") # Log full name

    # History translation loop (Correctly uses 'alex')
    gemini_history = []
    # print(f"[DEBUG] Raw history received: {history}") # Optional debug
    for msg in history:
        speaker = msg.get('speaker')
        text = msg.get('text', '').strip()
        if text:
            if speaker == 'alex': # <-- Correct
                gemini_history.append({"role": "model", "parts": [{"text": text}]})
                # print(f"[DEBUG] Added model msg: {text[:50]}...") # Optional debug
            elif speaker == 'user':
                gemini_history.append({"role": "user", "parts": [{"text": text}]})
                # print(f"[DEBUG] Added user msg: {text[:50]}...") # Optional debug

    # Get system prompt using the potentially shorter first name
    system_prompt_text = get_system_prompt(mode, role, skills, first_name_for_prompt, resume_text)
    if not system_prompt_text: return "Error: Could not generate interview context..."

    try:
        # Initialize model instance for *this specific request*
        current_model = GenerativeModel(GEMINI_MODEL, system_instruction=[system_prompt_text])
    except Exception as e:
        print(f"Error initializing model for request: {e}")
        return "Error: Could not configure AI model for this request."

    # Safety settings
    safety_settings = { cat: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE for cat in HarmCategory }

    try:
        print(f"Sending contents to Gemini: {gemini_history}")
        if not gemini_history:
            contents_to_send = [{"role": "user", "parts": [{"text": "Start the interview."}]}]
            print("Sending placeholder 'Start...'")
        else:
            contents_to_send = gemini_history

        response = current_model.generate_content(
            contents=contents_to_send,
            generation_config={"temperature": 0.7},
            safety_settings=safety_settings
        )

        print(f"Raw Gemini Response: {response}") # Log the full response object
        if hasattr(response, 'text') and response.text:
            print("Received valid text response from Gemini.")
            return response.text.strip()
        else:
            # Handle empty/blocked response
            reason_msg = "Unknown reason (text missing)"
            reason = "UNKNOWN"
            try:
                if response.candidates:
                    candidate = response.candidates[0]
                    reason = candidate.finish_reason.name
                    reason_msg = f"Finish Reason: {reason}"
                    print(f"Finish Reason: {reason}, Safety: {candidate.safety_ratings}")
                elif hasattr(response, 'prompt_feedback') and response.prompt_feedback.block_reason:
                    reason = f"Blocked - {response.prompt_feedback.block_reason}"
                    reason_msg = f"Blocked Reason: {response.prompt_feedback.block_reason_message or reason}"
                    print(f"Response blocked: {reason_msg}")

                # Decide message based on reason
                if reason != 'STOP' and not reason.startswith("Blocked"):
                    return f"My response generation was interrupted ({reason}). Could you try again?"
                else: # Covers STOP+empty and Blocked
                    return f"My response was empty or incomplete ({reason_msg}). Please try again."

            except (AttributeError, IndexError, Exception) as log_e:
                print(f"Error extracting response details: {log_e}")
                return f"My response was empty or incomplete ({reason_msg}). Please try again."

    except Exception as e:
        # Handle API call errors
        print(f"❌ An error occurred during Gemini content generation: {type(e).__name__} - {e}")
        error_message = f"An error occurred while contacting the AI ({type(e).__name__})."
        if "quota" in str(e).lower(): error_message = "API Quota Exceeded..."
        elif "permission denied" in str(e).lower() or "denied" in str(e).lower(): error_message = "Permission Error..."
        elif isinstance(e, google.auth.exceptions.GoogleAuthError): error_message = f"Authentication Error ({type(e).__name__})..."
        print(f"   Detailed Error: {e}")
        return error_message + " Check backend logs for details."


# --- NAME EXTRACTION FUNCTION ---
# (Uses its own temporary model instance)
def extract_name_from_resume(resume_text: str) -> str:
    """
    Uses the generative model to extract the candidate's name from resume text.
    """
    if not VERTEX_AI_INITIALIZED:
        print("❌ Error: Vertex AI not initialized. Cannot extract name.")
        if not initialize_vertex_ai(): return "" # Try initializing again

    # Check if model name was valid on startup, otherwise skip extraction
    if not MODEL_INITIALIZED:
        print("⚠️ Warning: Model initialization failed during startup check. Skipping name extraction.")
        return ""

    text_to_scan = resume_text[:1500] # Limit input size

    try:
        system_prompt = "You are an expert resume parser. You will be given text and you will extract the candidate's full name. Respond ONLY with the full name and nothing else."
        user_content = f"TEXT:\n---\n{text_to_scan}\n---"

        # Initialize a temporary model specifically for this task
        extraction_model = GenerativeModel(
            GEMINI_MODEL,
            system_instruction=[system_prompt]
        )

        response = extraction_model.generate_content(
            [user_content], # Content must be iterable
            generation_config={"temperature": 0.0}, # Low temp for extraction
        )

        if hasattr(response, 'text') and response.text:
            name = response.text.strip()
            # Clean up potential labels added by the model
            name = re.sub(r"^\*?\s*Name:\s*", "", name, flags=re.IGNORECASE)
            print(f"✅ Name extraction successful: '{name}'")
            return name.strip()
        else:
            print("⚠️ Warning: Name extraction returned no text.")
            return ""
    except Exception as e:
        print(f"❌ Error during name extraction: {e}")
        print(traceback.format_exc()) # Log the full error traceback
        return ""