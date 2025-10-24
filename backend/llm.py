# backend/llm.py

import os
import vertexai
from vertexai.generative_models import (
    GenerativeModel, 
    HarmCategory, 
    HarmBlockThreshold
)
import google.auth

# --- Configuration ---
try:
    # This finds your GOOGLE_APPLICATION_CREDENTIALS variable
    credentials, PROJECT_ID = google.auth.default()
    vertexai.init(project=PROJECT_ID, location="us-central1")
    print(f"✅ Vertex AI initialized for project: {PROJECT_ID}")
except Exception as e:
    print(f"❌ ERROR: Could not initialize Vertex AI. Is GOOGLE_APPLICATION_CREDENTIALS set?")
    print(e)

# Use the exact model you specified
GEMINI_MODEL = "gemini-2.5-flash-lite" 

# --- Helper Functions ---

def get_system_prompt(
    mode: str, 
    role: str = None, 
    skills: str = None, 
    user_name: str = None, 
    resume_text: str = None  # <-- This is the corrected function definition
) -> str:
    """
    Generates the system prompt (your optimized bullet-point version).
    """
    
    name_to_use = user_name or "the candidate"
    
    if mode == "position":
        base_prompt = f"""
        **CONTEXT:**
        - You are Alex, a professional technical interviewer.
        - The conversation has *already* started.
        - The candidate's name is: {name_to_use}.
        - The candidate's *first message* in the chat history is their name.
        
        **MISSION:**
        - Role to interview for: {role or 'technical'}
        - Candidate's listed skills: {skills or 'Not specified'}
        - Your first job is to respond to their name and ask your first question.
        
        **RULES:**
        1.  **NO META-COMMENTARY.** Your response must *only* be what an interviewer would say.
        2.  **ASK PROBING QUESTIONS.** Ask follow-up questions based on the candidate's answers.
        3.  **ADJUST DIFFICULTY.** If 'intern' or 'junior' is in the role, ask about fundamentals and experience level.
        4.  **END PHRASE.** When you are finished, you MUST end the interview with this *exact* line: "good bye, thank you for your time, we will get back to you"
        """
    else: # Default to "resume" mode
        base_prompt = f"""
        **CONTEXT:**
        - You are Alex, a professional interviewer.
        - The conversation has *already* started.
        - The candidate's name is: {name_to_use}.

        **MISSION:**
        - Your first job is to respond to their name and start the interview based *entirely* on their resume.
        - **HERE IS THE CANDIDATE'S RESUME:**
          ---
          {resume_text or 'No resume provided. Ask them to describe their experience.'}
          ---
        
        **RULES:**
        1.  **NO META-COMMENTARY.**
        2.  **ASK PROBING QUESTIONS.** Ask follow-up questions *about the resume*.
        3.  **END PHRASE.** End with: "good bye, thank you for your time, we will get back to you"
        """
    
    return base_prompt.strip()


# --- Main Gemini Function ---

def query_gemini(
    history: list, 
    mode: str, 
    role: str = None, 
    skills: str = None, 
    resume_text: str = None
) -> str:
    
    print(f"Interviewer (Gemini) is thinking... (Mode: {mode}, Role: {role})")
    
    # 1. Translate the history
    gemini_history = []
    for msg in history:
        if msg['speaker'] == 'alex':
            gemini_history.append({"role": "model", "parts": [{"text": msg['text']}]})
        elif msg['speaker'] == 'user':
            gemini_history.append({"role": "user", "parts": [{"text": msg['text']}]})

    # 2. Get the user's name (for the prompt)
    user_name = None
    if len(gemini_history) > 1 and gemini_history[1]["role"] == "user":
        # The user's name is the content of the second message
        user_name = gemini_history[1]["parts"][0]["text"] 
    
    # 3. Get the full system prompt
    # This call now correctly passes 5 arguments
    system_prompt_text = get_system_prompt(mode, role, skills, user_name, resume_text)
    
    # 4. Initialize the model
    model = GenerativeModel(
        GEMINI_MODEL,
        system_instruction=[system_prompt_text]
    )
    
    # 5. Set safety settings to be permissive
    safety_settings = {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
    }

    try:
        # 6. Generate the content
        response = model.generate_content(
            gemini_history,
            safety_settings=safety_settings
        )
        
        return response.text
        
    except Exception as e:
        print(f"An error occurred while querying Gemini: {e}")
        return f"An error occurred while querying Gemini: {e}"