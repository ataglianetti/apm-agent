#!/usr/bin/env python3
"""
Simulate the expected agent response for the multi-step workflow prompt
"""

import csv
import json

def simulate_agent_response():
    """Simulate what the APM agent would do and return"""

    print("\n" + "=" * 60)
    print("SIMULATED AGENT RESPONSE")
    print("=" * 60)
    print()

    # The user's prompt
    prompt = "Filter for tracks with stems, run an audio similarity search on 'Good Rockin Tonight A', and add the first 10 results to your Swinging into the New Year project."

    print(f"User: {prompt}\n")
    print("-" * 40)
    print("\nAgent Response:\n")

    # Agent's response
    print("I'll help you with that multi-step workflow. Let me:")
    print("1. Find similar tracks to 'Good Rockin Tonight A'")
    print("2. Filter for tracks with stems")
    print("3. Add the first 10 results to your Swinging into the New Year project\n")

    print("Finding similar tracks to 'Good Rockin Tonight A'...")

    # Step 1: Find similar tracks
    with open('data/audio_similarities.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        similar_track_ids = []
        for row in reader:
            if row['source_track_id'] == 'RCK_RCK_0100_00101':
                similar_track_ids = row['similar_track_ids'].split(';')
                print(f"Found {len(similar_track_ids)} similar rockabilly/rock and roll tracks.")
                break

    # Step 2: Get track details and filter for stems
    print("\nFiltering for tracks with stems...")

    tracks_with_stems = []
    with open('data/tracks.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['id'] in similar_track_ids and row.get('has_stems') == 'true':
                tracks_with_stems.append({
                    'id': row['id'],
                    'track_title': row['track_title'],
                    'track_description': row['track_description'],
                    'album_title': row['album_title'],
                    'library_name': row['library_name'],
                    'composer': row['composer'],
                    'genre': row['genre'],
                    'additional_genres': row.get('additional_genres', ''),
                    'bpm': row['bpm'],
                    'duration': row['duration'],
                    'has_stems': row['has_stems']
                })

    print(f"{len(tracks_with_stems)} tracks have stems available.")

    # Step 3: Take first 10 and display
    selected_tracks = tracks_with_stems[:10]
    print(f"\nAdding the first {len(selected_tracks)} tracks to your 'Swinging into the New Year' project...\n")

    # Display as JSON (like the agent would)
    response_json = {
        "type": "track_results",
        "message": "✅ Successfully added 10 rock and roll tracks with stems to your 'Swinging into the New Year' project (P012). These tracks are perfect for your New Year's Eve celebration with their upbeat, party atmosphere and classic rock and roll energy. All tracks have stem files available for flexible mixing.",
        "tracks": []
    }

    for track in selected_tracks[:3]:  # Show first 3 as preview
        response_json["tracks"].append({
            "id": track['id'],
            "track_title": track['track_title'],
            "track_description": track['track_description'][:100] + "...",
            "album_title": track['album_title'],
            "library_name": track['library_name'],
            "composer": track['composer'],
            "genre": "Rockabilly / Rock & Roll",
            "bpm": track['bpm'],
            "duration": f"{int(track['duration'])//60}:{int(track['duration'])%60:02d}",
            "has_stems": "true"
        })

    print(json.dumps(response_json, indent=2))

    print("\n📋 Added tracks:")
    for i, track in enumerate(selected_tracks, 1):
        print(f"  {i}. {track['track_title']} ({track['id']})")

    print("\n✨ All tracks have been successfully added to project P012 with stem files available.")
    print("\n" + "=" * 60)

if __name__ == '__main__':
    simulate_agent_response()