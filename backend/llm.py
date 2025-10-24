# backend/llm.py

import re
import requests

# --- Configuration ---
OLLAMA_MODEL = "llama3:8b"
OLLAMA_HOST = "http://localhost:11434"

# --- Helper Functions ---

def get_system_prompt(
    mode: str, 
    role: str = None, 
    skills: str = None, 
    user_name: str = None, 
    resume_text: str = None  # <-- Accept new param
) -> dict:
    
    name_to_use = user_name or "the candidate"
    
    if mode == "position":
        base_prompt = f"""
        **CONTEXT:**
        - You are Alex, a professional technical interviewer.
        - The conversation has *already* started.
        - The candidate's name is: {name_to_use}.
        
        **MISSION:**
        - Role to interview for: {role or 'technical'}
        - Candidate's listed skills: {skills or 'Not specified'}
        - Your first job is to respond to their name and ask your first question.
        
        **RULES:**
        1.  **NO META-COMMENTARY.**
        2.  **ASK PROBING QUESTIONS.**
        3.  **ADJUST DIFFICULTY.** (e.g., 'intern' vs 'senior')
        4.  **END PHRASE.** End with: "good bye, thank you for your time, we will get back to you"
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
    
    return {"role": "system", "content": base_prompt.strip()}


# --- Main Ollama Function ---

def query_ollama(
    history: list, 
    mode: str, 
    role: str = None, 
    skills: str = None, 
    resume_text: str = None  # <-- Accept new param
) -> str:
    
    print(f"Interviewer is thinking... (Mode: {mode}, Role: {role})")
    
    ollama_history = []
    for msg in history:
        if msg['speaker'] == 'alex':
            ollama_history.append({"role": "assistant", "content": msg['text']})
        elif msg['speaker'] == 'user':
            ollama_history.append({"role": "user", "content": msg['text']})

    user_name = None
    if len(ollama_history) > 1 and ollama_history[1]["role"] == "user":
        user_name = ollama_history[1]["content"] 
    
    # Pass all info to the prompt generator
    system_prompt = get_system_prompt(mode, role, skills, user_name, resume_text)
    
    messages = [system_prompt] + ollama_history
            
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/chat",
            json={"model": OLLAMA_MODEL, "messages": messages, "stream": False},
            timeout=120
        )
        response.raise_for_status()
        reply_text = response.json()["message"]["content"].strip()
        return reply_text
        
    except requests.exceptions.ConnectionError:
        print(f"Error: Could not connect to Ollama at {OLLAMA_HOST}")
        return f"Error: Could not connect to Ollama."
    except requests.exceptions.RequestException as e:
        print(f"An error occurred while querying Ollama: {e}")
        return f"An error occurred while querying Ollama."