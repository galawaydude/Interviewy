# backend/llm.py

import os
import vertexai
from vertexai.generative_models import (
    GenerativeModel,
    HarmCategory,
    HarmBlockThreshold,
    Part # Import Part for specific content types if needed later
)
import google.auth
import sys

# --- Configuration & Initialization ---
# Moved initialization logic inside a function to be called explicitly if needed
# Global variable to hold the initialized status and project ID
VERTEX_AI_INITIALIZED = False
PROJECT_ID = None
MODEL_INITIALIZED = False
model = None # Global model instance

def initialize_vertex_ai():
    global VERTEX_AI_INITIALIZED, PROJECT_ID, MODEL_INITIALIZED, model, GEMINI_MODEL
    if VERTEX_AI_INITIALIZED:
        # print("Vertex AI already initialized.")
        return True

    try:
        print("Attempting to initialize Vertex AI...")
        credentials, detected_project_id = google.auth.default()
        PROJECT_ID = detected_project_id # Store the project ID
        vertexai.init(project=PROJECT_ID, location="us-central1") # Standard location
        print(f"✅ Vertex AI initialized successfully for project: {PROJECT_ID}")
        VERTEX_AI_INITIALIZED = True

        # Initialize the model right after Vertex AI init
        try:
            print(f"Initializing GenerativeModel: {GEMINI_MODEL}")
            model = GenerativeModel(GEMINI_MODEL) # Initialize model instance
            MODEL_INITIALIZED = True
            print(f"✅ GenerativeModel '{GEMINI_MODEL}' initialized.")
        except Exception as model_e:
            print(f"❌ ERROR: Could not initialize the GenerativeModel '{GEMINI_MODEL}'.")
            print(f"   Details: {type(model_e).__name__} - {model_e}")
            MODEL_INITIALIZED = False # Ensure flag is false

        return True

    except google.auth.exceptions.DefaultCredentialsError:
        print(f"❌ CRITICAL ERROR: Could not find Google Cloud credentials.")
        print(f"   Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly.")
        PROJECT_ID = None
        VERTEX_AI_INITIALIZED = False
        return False
    except Exception as e:
        print(f"❌ CRITICAL ERROR: Could not initialize Vertex AI.")
        print(f"   Details: {type(e).__name__} - {e}")
        PROJECT_ID = None
        VERTEX_AI_INITIALIZED = False
        return False

# Model name configuration
GEMINI_MODEL = "gemini-2.5-flash-lite" # Using 1.5 Flash as -lite isn't standard SDK name

# Call initialization when the module is loaded
initialize_vertex_ai()

# --- Helper Functions ---

def get_system_prompt(
    mode: str,
    role: str = None,
    skills: str = None,
    user_name: str = None, # Accept name directly
    resume_text: str = None
) -> str | None: # Return None if prompt generation fails
    """
    Generates the system prompt string based on mode and context.
    Returns None if essential info is missing for a good prompt.
    """
    try:
        name_to_use = user_name or "the candidate" # Use provided name or default

        if mode == "position":
            # Basic check for required info in position mode
            if not role:
                 print("⚠️ Warning: Role not provided for position mode prompt.")
                 # Decide if you want to proceed with a generic prompt or return None
                 # return None # Option 1: Fail if role is missing
                 role = "the specified technical" # Option 2: Use placeholder

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
            # Truncate long resumes (keep end, which often has recent experience)
            max_resume_chars = 3500 # Adjust as needed based on token limits/performance
            if resume_text and len(resume_text) > max_resume_chars:
                 print(f"Truncating resume text from {len(resume_text)} to {max_resume_chars} characters.")
                 truncated_resume = f"... (resume truncated) ...\n{resume_text[-max_resume_chars:]}"
            else:
                 truncated_resume = resume_text or 'No resume provided.'

            # Handle case where no resume is provided
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
    user_name: str = None # Accept name directly
) -> str:

    # Ensure Vertex AI and the model are initialized
    if not VERTEX_AI_INITIALIZED:
        return "Error: Vertex AI failed to initialize. Check backend logs."
    if not MODEL_INITIALIZED or model is None:
         # Try initializing again, might succeed if credentials became available
         if initialize_vertex_ai() and MODEL_INITIALIZED and model:
              print("Re-attempted and succeeded initializing Vertex AI model.")
         else:
              return "Error: AI Model is not available. Check backend logs."


    print(f"Interviewer (Gemini) thinking... (Mode: {mode}, Role: {role}, Name: {user_name})")

    # 1. Translate the history (Ensure text is not None)
    gemini_history = []
    for msg in history:
        speaker = msg.get('speaker')
        text = msg.get('text', '').strip() # Default to empty string
        if text: # Only add non-empty messages
            if speaker == 'alex':
                gemini_history.append({"role": "model", "parts": [{"text": text}]})
            elif speaker == 'user':
                gemini_history.append({"role": "user", "parts": [{"text": text}]})

    # 2. Get the system prompt
    system_prompt_text = get_system_prompt(mode, role, skills, user_name, resume_text)
    if not system_prompt_text: # Handle prompt generation failure
         return "Error: Could not generate interview context. Please check mode or backend logs."

    # 3. Apply system instruction to the model instance for this call
    # Note: Re-initializing or modifying the global 'model' might not be thread-safe
    # if you scale Flask. Consider initializing model per request if needed.
    # For now, we assume the global model exists.
    # We set system_instruction directly on the initialized model if possible,
    # but the SDK might require it during initialization or via a specific method.
    # The current SDK pattern is often to include it at initialization.
    # Let's re-initialize here for safety, though less efficient.
    try:
        current_model = GenerativeModel(GEMINI_MODEL, system_instruction=[system_prompt_text])
    except Exception as e:
        print(f"Error re-initializing model with system prompt: {e}")
        return "Error: Could not configure AI model for this request."


    # 4. Set safety settings (more restrictive is safer, but BLOCK_NONE for max flexibility)
    safety_settings = {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, # Stricter
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, # Stricter
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, # Stricter
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, # Stricter
    }
    # Or keep BLOCK_NONE if you trust your prompts and need max flexibility:
    # safety_settings = { category: HarmBlockThreshold.BLOCK_NONE for category in HarmCategory }


    try:
        # 5. Generate the content
        print(f"Sending contents to Gemini: {gemini_history}")

        # If history is empty, send a minimal 'user' turn to trigger the first response based on system prompt.
        if not gemini_history:
             contents_to_send = [{"role": "user", "parts": [{"text": "Start the interview."}]}]
             print("Sending placeholder 'Start...' to trigger initial greeting from AI.")
        else:
             contents_to_send = gemini_history # Send actual conversation

        # Generate content using the request-specific model instance
        response = current_model.generate_content(
            contents=contents_to_send,
            generation_config={"temperature": 0.7}, # Add temperature for less deterministic responses
            safety_settings=safety_settings
        )

        # 6. Robust response checking
        print(f"Raw Gemini Response: {response}") # Log the full response object
        if hasattr(response, 'text') and response.text:
            print("Received valid text response from Gemini.")
            return response.text.strip()
        else:
            # More detailed logging if text is missing
            reason_msg = "Unknown reason (text missing)"
            safety_info = "N/A"
            try:
                if response.candidates:
                    candidate = response.candidates[0]
                    reason = candidate.finish_reason.name # Get enum name
                    safety_info = candidate.safety_ratings
                    reason_msg = f"Finish Reason: {reason}"
                    print(f"Finish Reason: {reason}, Safety Ratings: {safety_info}")

                    if reason != 'STOP': # STOP is normal, others are issues
                         return f"My response generation was interrupted ({reason}). Could you try again?"
                    else: # Reason was STOP but text is empty
                         return "My response was empty. Could you please try again?"
                elif hasattr(response, 'prompt_feedback') and response.prompt_feedback.block_reason:
                    reason = f"Blocked - {response.prompt_feedback.block_reason}"
                    reason_msg = f"Blocked Reason: {response.prompt_feedback.block_reason_message or reason}"
                    print(f"Response blocked: {reason_msg}")
                    return f"My response was blocked ({reason}). Please adjust your input or contact support if this seems wrong."
                else:
                     print(f"Warning/Error: Gemini response issue. Response object structure: {response}")

            except (AttributeError, IndexError, Exception) as log_e:
                print(f"Error extracting response details: {log_e}")

            return f"My response was empty or incomplete ({reason_msg}). Please try again."


    except Exception as e:
        print(f"❌ An error occurred during Gemini content generation: {type(e).__name__} - {e}")
        # Add specific error checks based on potential API errors
        error_message = f"An error occurred while contacting the AI ({type(e).__name__})."
        if "quota" in str(e).lower():
             error_message = "API Quota Exceeded. Please check your Google Cloud project quotas."
        elif "permission denied" in str(e).lower() or "denied" in str(e).lower():
             error_message = "Permission Error. Ensure the Service Account has the 'Vertex AI User' role."
        elif isinstance(e, google.auth.exceptions.GoogleAuthError):
             error_message = f"Authentication Error ({type(e).__name__}). Ensure GOOGLE_APPLICATION_CREDENTIALS is valid and points to the correct key file."

        print(f"   Detailed Error: {e}") # Log the full error
        return error_message + " Check backend logs for details."