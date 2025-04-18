# import os
# import dotenv
# import requests
# import json

# # Get the directory where the script is located
# script_dir = os.path.dirname(os.path.abspath(__file__))
# # Construct the path to the .env.local file
# dotenv_path = os.path.join(script_dir, ".env.local")

# # Load environment variables from .env.local in the script's directory
# if os.path.exists(dotenv_path):
#     dotenv.load_dotenv(dotenv_path=dotenv_path)
# else:
#     print(f"Warning: .env.local file not found at {dotenv_path}. Trying environment variables.")

# # Get the API key from environment variables
# api_key = os.getenv("GEMINI_API_KEY")

# if not api_key:
#     print("Error: GEMINI_API_KEY not found in .env.local or environment variables.")
#     exit(1)

# # API Endpoint details from the curl command
# # Note: The model name might differ, adjust if needed based on your plan/available models.
# # The image shows 'gemini-2.0-flash', but the v1beta endpoint often uses models like 'gemini-pro' or 'gemini-1.5-flash-latest'.
# # Let's try the one from the image first.
# model_name = "gemini-1.5-flash-latest" # Adjusted based on common usage, but check AI Studio if needed.
# # model_name = "gemini-pro" # Common alternative
# url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

# # Headers
# headers = {
#     "Content-Type": "application/json"
# }

# # Data payload based on the curl command's structure
# # Using a different prompt for variety
# prompt_text = "What is the capital of France?"
# data = {
#     "contents": [{
#         "parts": [{"text": prompt_text}]
#     }]
# }

# print(f"Sending prompt: '{prompt_text}' to {model_name} via REST API")

# # Make the POST request
# try:
#     response = requests.post(url, headers=headers, data=json.dumps(data))
#     response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

#     # Process the response
#     response_json = response.json()
#     # Extract the text from the response structure
#     # The structure might vary slightly, adding error handling
#     try:
#         generated_text = response_json['candidates'][0]['content']['parts'][0]['text']
#         print("\nAPI Response:")
#         print(generated_text)
#     except (KeyError, IndexError, TypeError) as e:
#         print(f"\nError parsing response JSON: {e}")
#         print("Full response:")
#         print(response_json)
#         exit(1)

# except requests.exceptions.RequestException as e:
#     print(f"\nError making API request: {e}")
#     # Optionally print response body if available for more details
#     if e.response is not None:
#         print(f"Response status code: {e.response.status_code}")
#         try:
#             print(f"Response body: {e.response.json()}")
#         except json.JSONDecodeError:
#             print(f"Response body (non-JSON): {e.response.text}")
#     exit(1)
# except Exception as e:
#     print(f"\nAn unexpected error occurred: {e}")
#     exit(1)


# print("\nScript finished successfully.") 