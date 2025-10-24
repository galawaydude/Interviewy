import os
import io
from google.cloud import texttospeech
from google.cloud import speech

def test_google_services():
    """
    Attempts to call both TTS and STT APIs to check if billing is active.
    """
    
    # --- 1. Test Text-to-Speech (TTS) ---
    print("--- Testing Google Text-to-Speech (TTS) ---")
    try:
        tts_client = texttospeech.TextToSpeechClient()
        
        synthesis_input = texttospeech.SynthesisInput(text="This is a billing test.")
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US", name="en-US-Wavenet-A"
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )

        response = tts_client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )

        # If it gets here, it worked.
        with open("test.mp3", "wb") as out:
            out.write(response.audio_content)
        
        print("\n✅ TTS Test SUCCESSFUL. Billing is active.")
        print("A file named 'test.mp3' has been created.\n")

    except Exception as e:
        print("\n❌ TTS Test FAILED.")
        if "BILLING_DISABLED" in str(e):
            print("   Error: Billing is still disabled or propagating.")
        else:
            print(f"   An unexpected error occurred: {e}\n")
        return # Stop if TTS fails, as STT will also fail

    # --- 2. Test Speech-to-Text (STT) ---
    print("--- Testing Google Speech-to-Text (STT) ---")
    try:
        stt_client = speech.SpeechClient()
        
        # We need to send a valid, empty audio file to test the endpoint.
        # This creates a 1-second silent audio clip in memory.
        silent_wav_bytes = create_silent_wav()

        audio = speech.RecognitionAudio(content=silent_wav_bytes)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code="en-US",
        )

        # Call the recognize method
        response = stt_client.recognize(config=config, audio=audio)
        
        # If it gets here, it means the API accepted the request
        print("\n✅ STT Test SUCCESSFUL. Billing is active.")
        print("(Received a valid, empty response from the API)\n")

    except Exception as e:
        print("\n❌ STT Test FAILED.")
        if "BILLING_DISABLED" in str(e):
            print("   Error: Billing is still disabled or propagating.")
        else:
            print(f"   An unexpected error occurred: {e}\n")

def create_silent_wav():
    """Generates 1 second of silent WAV audio bytes."""
    import wave
    
    sample_rate = 16000
    duration_seconds = 1
    n_frames = sample_rate * duration_seconds
    
    file_io = io.BytesIO()
    with wave.open(file_io, 'wb') as wf:
        wf.setnchannels(1)  # mono
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(b'\x00' * n_frames * 2) # 2 bytes per frame
    
    return file_io.getvalue()

# --- Run the test ---
if __name__ == "__main__":
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        print("❌ ERROR: The 'GOOGLE_APPLICATION_CREDENTIALS' environment variable is not set.")
        print("   Please set it in your terminal before running this script.")
    else:
        print(f"Using credentials from: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')}\n")
        test_google_services()