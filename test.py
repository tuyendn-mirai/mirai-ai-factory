import requests
import os
import uuid

api_key = 'sk-ZmrGWae4kxxtdvpYETBktW8Xdpoflto2fYz1_sDK4IU'
url = "http://localhost:7860/api/v1/run/aa23f959-4ae9-4a8f-a7ba-e7abd40e33d0"  # The complete API endpoint URL for this flow

# Request payload configuration
payload = {
    "output_type": "chat",
    "input_type": "chat",
    "input_value": "bạn là ai"
}
payload["session_id"] = str(uuid.uuid4())

headers = {"x-api-key": api_key}

try:
    # Send API request
    response = requests.request("POST", url, json=payload, headers=headers)
    response.raise_for_status()  # Raise exception for bad status codes

    # Print response
    print(response.text)

except requests.exceptions.RequestException as e:
    print(f"Error making API request: {e}")
except ValueError as e:
    print(f"Error parsing response: {e}")