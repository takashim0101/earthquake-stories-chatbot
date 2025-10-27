# geocode_stories.py
# This script reads the analyzed stories, geocodes their locations using a local Photon server,
# and saves the enriched data to a new JSON file for the API to serve.

import json
import os
import re
import requests

# --- Configuration ---
BASE_DIR = os.path.dirname(__file__)
ANALYZED_DATA_FILE = os.path.join(BASE_DIR, "analyzed_stories.json")
OUTPUT_GEOCODED_FILE = os.path.join(BASE_DIR, "geocoded_stories.json")

PHOTON_URL = "http://127.0.0.1:2322/api"

geocode_cache = {}

# --- Geocoding Function ---
def get_coordinates(location_name):
    """
    Geocodes a location name using a local Photon server, with caching.
    """
    if location_name in geocode_cache:
        return geocode_cache[location_name]

    print(f"  - Geocoding '{location_name}'...")
    try:
        params = {"q": location_name, "lang": "en"}
        response = requests.get(PHOTON_URL, params=params)
        response.raise_for_status()
        data = response.json()
        
        if data and data.get('features'):
            coords = data['features'][0]['geometry']['coordinates']
            coordinates = {"latitude": coords[1], "longitude": coords[0]}
            geocode_cache[location_name] = coordinates
            return coordinates
        else:
            geocode_cache[location_name] = None
            return None
    except requests.exceptions.RequestException as e:
        print(f"  - Error connecting to Photon: {e}")
        geocode_cache[location_name] = None
        return None

# --- Main Processing Function ---
def enrich_stories_with_coords():
    """
    Reads analyzed stories, adds coordinates, and saves to a new file.
    """
    if not os.path.exists(ANALYZED_DATA_FILE):
        print(f"Error: Analyzed data file not found at {ANALYZED_DATA_FILE}")
        return

    with open(ANALYZED_DATA_FILE, 'r', encoding='utf-8') as f:
        stories = json.load(f)

    geocoded_stories = []

    print("\nStarting to enrich stories with geocoded data...")
    for story in stories:
        story_id = story.get('story_id')
        if not story_id:
            continue

        match = re.findall(r'\[(.*?)\]', story_id)
        location_str = match[1].strip() if len(match) >= 2 else None

        if location_str:
            coordinates = get_coordinates(location_str)
            story['location'] = {
                "name": location_str,
                "coordinates": coordinates
            }
        else:
            story['location'] = {"name": None, "coordinates": None}
        
        geocoded_stories.append(story)

    # Save the enriched data to the output file
    with open(OUTPUT_GEOCODED_FILE, 'w', encoding='utf-8') as f:
        json.dump(geocoded_stories, f, indent=4, ensure_ascii=False)
    
    print(f"\nProcessing complete! Saved geocoded data to {OUTPUT_GEOCODED_FILE}")

# --- Main entry point ---
if __name__ == "__main__":
    enrich_stories_with_coords()
