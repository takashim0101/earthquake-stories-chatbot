# geocode_api.py
# This script runs a simple Flask web server to provide a local geocoding API.
# It is designed to work with a local instance of the Photon geocoder: https://github.com/komoot/photon
# By using a local geocoder, we avoid rate limits and costs associated with public APIs.

from flask import Flask, request, jsonify
import requests

# --- Flask App Initialization ---
app = Flask(__name__)

# --- Configuration ---
# URL for the local Photon API server.
# The default port for Photon is 2322.
PHOTON_URL = "http://127.0.0.1:2322/api"

# In-memory cache to store geocoding results and avoid redundant requests.
geocode_cache = {}

@app.route('/geocode', methods=['POST'])
def geocode_location():
    """
    Handles the /geocode endpoint.
    Receives a location name, geocodes it using the local Photon server, and returns the coordinates.
    It uses an in-memory cache to speed up repeated requests for the same location.

    Request Body (JSON):
        {
            "location": "Your Location Name"
        }

    Returns:
        JSON response with latitude and longitude, or an error message.
    """
    # Get location name from the POST request's JSON body.
    location_name = request.json.get('location')
    if not location_name:
        return jsonify({"error": "No location provided"}), 400

    # Return cached result if available.
    if location_name in geocode_cache:
        print(f"Returning cached result for: {location_name}")
        return jsonify(geocode_cache[location_name])

    print(f"Geocoding '{location_name}' using local Photon server...")
    
    try:
        # Send a GET request to the local Photon server.
        params = {"q": location_name}
        response = requests.get(PHOTON_URL, params=params)
        response.raise_for_status()  # Raise an HTTPError for bad responses (4xx or 5xx)

        data = response.json()
        
        # Photon returns results in a 'features' array.
        # We take the first result as the most likely match.
        if data and data.get('features'):
            # The coordinates are in [longitude, latitude] format.
            coordinates = data['features'][0]['geometry']['coordinates']
            result = {
                "latitude": coordinates[1],
                "longitude": coordinates[0]
            }
            
            # Cache the successful result.
            geocode_cache[location_name] = result
            return jsonify(result)
        else:
            # Location was not found by Photon.
            return jsonify({"error": "Location not found"}), 404

    except requests.exceptions.RequestException as e:
        # Handle network errors (e.g., connection refused if Photon server is not running).
        print(f"Error connecting to local Photon server: {e}")
        return jsonify({"error": "Failed to connect to local geocoding server. Is Photon running?"}), 503
    except Exception as e:
        # Handle other potential errors (e.g., JSON decoding).
        print(f"An unexpected error occurred: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run the Flask app on port 5001.
    # This port should be different from the main Node.js server port.
    print("Starting local geocoding server on http://127.0.0.1:5001")
    app.run(port=5001)
