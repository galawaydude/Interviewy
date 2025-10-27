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
import traceback # Import for logging

# --- Configuration & Initialization ---
VERTEX_AI_INITIALIZED = False
PROJECT_ID = None
MODEL_INITIALIZED = False
model = None # Global model instance

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
            print(f"Initializing GenerativeModel: {GEMINI_MODEL}")
            # Initialize global model (used as a fallback/check)
            model = GenerativeModel(GEMINI_MODEL) 
            MODEL_INITIALIZED = True
            print(f"✅ GenerativeModel '{GEMINI_MODEL}' initialized.")
        except Exception as model_e:
            print(f"❌ ERROR: Could not initialize the GenerativeModel '{GEMINI_MODEL}'.")
            print(f"   Details: {type(model_e).__name__} - {model_e}")
            MODEL_INITIALIZED = False 

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
GEMINI_MODEL = "gemini-2.5-flash-lite" 

# Call initialization when the module is loaded
initialize_vertex_ai()

# --- Helper Functions ---
def get_system_prompt(
    mode: str,
    role: str = None,
    skills: str = None,
    user_name: str = None, 
    resume_text: str = None
) -> str | None: 
    try:
        # --- ✅ "FIRST NAME" LOGIC ---
        if user_name:
             # Use the first part of the name, or the full name if it has no spaces
             first_name = user_name.split(' ')[0]
             name_to_use = first_name
        else:
             name_to_use = "the candidate"
        # --- END OF "FIRST NAME" LOGIC ---

        if mode == "position":
            if not role:
                print("⚠️ Warning: Role not provided for position mode prompt.")
                role = "the specified technical role"

            base_prompt = f"""
            **CONTEXT:**
            - You are Jeet, a highly-skilled technical interviewer and senior engineer for the company.
            - You are conducting a technical interview for a specific role.

            **MISSION:**
            - Role to interview for: {role}
            - Candidate's name: {name_to_use}
            - Key skills required: {skills or 'Not specified'}
            - Your first task is to greet the candidate warmly by name, briefly state the role, and ask your first introductory question (e.g., "Tell me about yourself" or "What interests you about this {role} role?"). Example: "Hello {name_to_use}, welcome! We're interviewing for the {role} position today. To start, could you tell me a little bit about yourself and your background?"

            **RULES:**
            1.  **BE PROFESSIONAL & FRIENDLY:** Maintain a positive, curious, and engaging tone. You are a collaborator trying to discover what they know.
            2.  **NO META-COMMENTARY:** Only output what Jeet would say. Do *not* add labels like "Jeet:", "(Thinking)", or "(Follow-up question)".

            ---
            **3.  DEEP TECHNICAL ANALYSIS (YOUR CORE TASK):**
                -   Your goal is to find the *true depth* of their knowledge related to the **Role ({role})** and **Key Skills ({skills})**.
                -   Ask *technical, situational, and behavioral questions* about these skills.
                -   **Example Flow (if skills="Python, Jenkins"):**
                    -   *Your Good Question:* "In your experience with Python, how have you handled error logging and monitoring in a production application?"
                    -   *Candidate's Answer:* "I used try/except blocks and the logging module."
                    -   *Your Good Follow-up:* "That's a good start. How would you expand that? For instance, how would you aggregate logs from multiple services, and how could you use a tool like SonarQube or a linter to maintain code quality in that Python project?"
                    -   *Your Bad Question:* "Do you like Python?"
                
            **4.  PROBE FOR "WHY" AND "HOW":**
                -   Go beyond "Do you know [skill]?". Ask "Why did you choose [tool] for [task]?" or "How would you design a system for [problem] using [skill]?"
                -   Ask for specific examples, trade-offs, and challenges.
                -   If the role is "C++ Developer", ask about memory management, modern C++ features, or debugging.
                -   If the role is "DevOps Engineer", ask about CI/CD (like Jenkins), containerization, and infrastructure as code.

            **5.  ADJUST DIFFICULTY:** If 'intern' or 'junior' is mentioned in the role ({role}), focus more on fundamentals, projects, and learning ability. For 'senior' roles, ask about system design, architecture, and leadership.
            
            **6.  INTERVIEW FLOW:** Start broad (intro question), then dive into technical/behavioral specifics related to the role and skills. Conclude after sufficient evaluation.

            **7.  END PHRASE:** When you decide the interview is complete (after 5-10 meaningful exchanges), you MUST end the conversation using this *exact* phrase and nothing else: "good bye, thank you for your time, we will get back to you"
            """
        
        elif mode == "resume":
            max_resume_chars = 3500 
            if resume_text and len(resume_text) > max_resume_chars:
                print(f"Truncating resume text from {len(resume_text)} to {max_resume_chars} characters.")
                truncated_resume = f"... (resume truncated) ...\n{resume_text[-max_resume_chars:]}"
            else:
                truncated_resume = resume_text or 'No resume provided.'

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
            - You are Jeet, a highly-skilled technical interviewer and senior engineer.
            - You are conducting a technical interview based *only* on the candidate's resume.

            **MISSION:**
            - Candidate's name: {name_to_use}
            - {resume_context_mission}
            - {resume_content_block}

            **RULES:**
            1.  **BE PROFESSIONAL & FRIENDLY:** Maintain a positive, curious, and engaging tone. You are not an adversary; you are a collaborator trying to discover what they know.
            2.  **NO META-COMMENTARY:** Only output what Jeet would say. Do *not* add labels like "Jeet:", "(Thinking)", or "(Follow-up question)".
            
            ---
            **3.  DEEP TECHNICAL ANALYSIS (YOUR CORE TASK):**
                -   Do not just read the resume. *Analyze* it like a senior engineer.
                -   Identify the technologies, projects, and roles listed (e.g., "Python," "Jenkins," "Project X," "Software Intern").
                -   Your goal is to find the *true depth* of their knowledge.
                -   If they list a technology (like "React", "Python", "Docker", "SonarQube", "C++"), ask *technical follow-up questions* about it.
                -   **Example Flow:**
                    -   Candidate says: "I worked on Project X using Python and Jenkins."
                    -   *Your Good Follow-up:* "That's interesting. Could you describe the CI/CD pipeline you built with Jenkins? What were the stages? How did you handle build failures?"
                    -   *Your Bad Follow-up:* "What did you like about Jenkins?"

            **4.  PROBE FOR "WHY" AND "HOW":**
                -   Go beyond "What did you do?". Ask "Why did you choose that approach?" or "How did you handle [a specific problem]?"
                -   Ask for specific examples, trade-offs, and challenges.
                -   If they list "C++", ask about memory management or OOP concepts.
                -   If they list "Graph Theory", ask them to explain a concept in the context of one of their projects.

            **5.  INTERVIEW FLOW:**
                -   Start with the opening question (your mission).
                -   Logically move through their resume, typically starting from the most recent experience or a major project.
                -   Dynamically adjust your questions based on their answers, just as a real technical expert would.

            **6.  END PHRASE:** When you decide the interview is complete (after 5-10 meaningful exchanges), you MUST end the conversation using this *exact* phrase and nothing else: "good bye, thank you for your time, we will get back to you"
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
    user_name: str = None 
) -> str:

    if not VERTEX_AI_INITIALIZED:
        return "Error: Vertex AI failed to initialize. Check backend logs."
    if not MODEL_INITIALIZED or model is None:
        if initialize_vertex_ai() and MODEL_INITIALIZED and model:
            print("Re-attempted and succeeded initializing Vertex AI model.")
        else:
            return "Error: AI Model is not available. Check backend logs."


    print(f"Interviewer (Gemini) thinking... (Mode: {mode}, Role: {role}, Name: {user_name})")

    # 1. Translate the history
    gemini_history = []
    for msg in history:
        speaker = msg.get('speaker')
        text = msg.get('text', '').strip() 
        if text: 
            if speaker == 'Jeet':
                gemini_history.append({"role": "model", "parts": [{"text": text}]})
            elif speaker == 'user':
                gemini_history.append({"role": "user", "parts": [{"text": text}]})

    # 2. Get the system prompt
    system_prompt_text = get_system_prompt(mode, role, skills, user_name, resume_text)
    if not system_prompt_text: 
        return "Error: Could not generate interview context. Please check mode or backend logs."

    # 3. Apply system instruction
    try:
        current_model = GenerativeModel(GEMINI_MODEL, system_instruction=[system_prompt_text])
    except Exception as e:
        print(f"Error re-initializing model with system prompt: {e}")
        return "Error: Could not configure AI model for this request."


    # 4. Set safety settings
    safety_settings = {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, 
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, 
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, 
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, 
    }


    try:
        # 5. Generate the content
        print(f"Sending contents to Gemini: {gemini_history}")

        if not gemini_history:
            contents_to_send = [{"role": "user", "parts": [{"text": "Start the interview."}]}]
            print("Sending placeholder 'Start...' to trigger initial greeting from AI.")
        else:
            contents_to_send = gemini_history 

        response = current_model.generate_content(
            contents=contents_to_send,
            generation_config={"temperature": 0.7}, 
            safety_settings=safety_settings
        )

        # 6. Robust response checking
        print(f"Raw Gemini Response: {response}") 
        if hasattr(response, 'text') and response.text:
            print("Received valid text response from Gemini.")
            return response.text.strip()
        else:
            reason_msg = "Unknown reason (text missing)"
            safety_info = "N/A"
            try:
                if response.candidates:
                    candidate = response.candidates[0]
                    reason = candidate.finish_reason.name 
                    safety_info = candidate.safety_ratings
                    reason_msg = f"Finish Reason: {reason}"
                    print(f"Finish Reason: {reason}, Safety Ratings: {safety_info}")

                    if reason != 'STOP': 
                        return f"My response generation was interrupted ({reason}). Could you try again?"
                    else: 
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
        error_message = f"An error occurred while contacting the AI ({type(e).__name__})."
        if "quota" in str(e).lower():
            error_message = "API Quota Exceeded. Please check your Google Cloud project quotas."
        elif "permission denied" in str(e).lower() or "denied" in str(e).lower():
            error_message = "Permission Error. Ensure the Service Account has the 'Vertex AI User' role."
        elif isinstance(e, google.auth.exceptions.GoogleAuthError):
            error_message = f"Authentication Error ({type(e).__name__}). Ensure GOOGLE_APPLICATION_CREDENTIALS is valid and points to the correct key file."

        print(f"   Detailed Error: {e}") 
        return error_message + " Check backend logs for details."


# --- NAME EXTRACTION FUNCTION ---
def extract_name_from_resume(resume_text: str) -> str:
    """
    Uses the generative model to extract the candidate's name from resume text.
    """
    
    if not VERTEX_AI_INITIALIZED:
        print("❌ Error: Vertex AI not initialized. Cannot extract name.")
        if not initialize_vertex_ai():
            return "" 
    
    text_to_scan = resume_text[:1500]

    try:
        system_prompt = "You are an expert resume parser. You will be given text and you will extract the candidate's full name. Respond ONLY with the full name and nothing else."
        user_content = f"TEXT:\n---\n{text_to_scan}\n---"

        extraction_model = GenerativeModel(
            GEMINI_MODEL,
            system_instruction=[system_prompt]
        )

        response = extraction_model.generate_content(
            [user_content], 
            generation_config={"temperature": 0.0},
        )

        if hasattr(response, 'text') and response.text:
            name = response.text.strip()
            name = re.sub(r"^\*?\s*Name:\s*", "", name, flags=re.IGNORECASE)
            print(f"✅ Name extraction successful: '{name}'")
            return name.strip()
        else:
            print("⚠️ Warning: Name extraction returned no text.")
            return ""

    except Exception as e:
        print(f"❌ Error during name extraction: {e}")
        print(traceback.format_exc())
        return ""