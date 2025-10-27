# visualize_map.py
# This script generates a static HTML map (story_map.html) to visualize the geocoded stories.
# It serves as a simple mock and test visualization of the processed data.

import json
import os
import re
import folium
import requests
from folium.plugins import HeatMap

# --- Configuration ---
BASE_DIR = os.path.dirname(__file__)
ANALYZED_DATA_FILE = os.path.join(BASE_DIR, "analyzed_stories.json")
OUTPUT_MAP_FILE = os.path.join(BASE_DIR, "story_map.html")
PHOTON_URL = "http://127.0.0.1:2322/api"
SENTIMENT_COLORS = {
    'positive': 'green',
    'negative': 'red',
    'neutral': 'blue'
}
geocode_cache = {}

# --- Geocoding Function ---
def get_coordinates(location_name):
    """Geocodes a location name using a local Photon server, with caching."""
    if location_name in geocode_cache:
        return geocode_cache[location_name]

    print(f"  - Geocoding '{location_name}' using local Photon...")
    try:
        params = {"q": location_name, "lang": "en"}
        response = requests.get(PHOTON_URL, params=params)
        response.raise_for_status()
        data = response.json()
        if data and data.get('features'):
            coords = data['features'][0]['geometry']['coordinates']
            coordinates = (coords[1], coords[0])  # Convert to (lat, lon)
            geocode_cache[location_name] = coordinates
            return coordinates
        else:
            geocode_cache[location_name] = None
            return None
    except requests.exceptions.RequestException as e:
        print(f"  - Error connecting to Photon: {e}. Skipping.")
        geocode_cache[location_name] = None
        return None

# --- Main Visualization Function ---
def create_story_map():
    """Generates an interactive HTML map that fits all story markers."""
    if not os.path.exists(ANALYZED_DATA_FILE):
        print(f"Error: Analyzed data file not found at {ANALYZED_DATA_FILE}")
        return

    with open(ANALYZED_DATA_FILE, 'r', encoding='utf-8') as f:
        stories = json.load(f)

    # Initialize map. Location and zoom will be set automatically later.
    story_map = folium.Map(tiles="OpenStreetMap")

    story_marker_group = folium.FeatureGroup(name='Story Markers').add_to(story_map)
    heatmap_data = []
    all_coords = [] # To store coordinates for auto-zooming

    print("\nProcessing stories and generating map data...")
    for story in stories:
        story_id = story.get('story_id')
        if not story_id:
            continue
        
        match = re.findall(r'\[([^\]]+)\]', story_id)
        location_str = match[2].strip() if len(match) >= 3 else None

        if not location_str:
            continue

        coordinates = get_coordinates(location_str)

        if coordinates:
            all_coords.append(coordinates)
            popup_html = f"""<h4>{story_id}</h4><p><b>Sentiment:</b> {story.get('sentiment')}</p><p><b>Topics:</b> {', '.join(story.get('topics', []))}</p><p><b>Summary:</b> {story.get('summary')}</p>"""
            
            folium.Marker(
                location=coordinates,
                popup=folium.Popup(popup_html, max_width=300),
                icon=folium.Icon(color=SENTIMENT_COLORS.get(story.get('sentiment', 'gray')), icon='info-sign')
            ).add_to(story_marker_group)
            
            heatmap_data.append([coordinates[0], coordinates[1], 1])

    # --- Auto-adjust map view ---
    if all_coords:
        story_map.fit_bounds(all_coords, padding=(50, 50))
    else:
        # Fallback to Christchurch if no coordinates were found
        story_map.location = [-43.532, 172.636]
        story_map.zoom_start = 11

    if heatmap_data:
        HeatMap(heatmap_data, name='Story Heatmap').add_to(story_map)

    folium.LayerControl().add_to(story_map)
    
    story_map.save(OUTPUT_MAP_FILE)
    print(f"\nMap generation complete! Saved to {OUTPUT_MAP_FILE}")

# --- Main entry point ---
if __name__ == "__main__":
    create_story_map()