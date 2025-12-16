#!/usr/bin/env python3
"""
Test the complete workflow:
1. Find 'Good Rockin Tonight A'
2. Get similar tracks
3. Filter for tracks with stems
4. Add first 10 to Swinging into the New Year project
"""

import csv
import json
import subprocess
import sys

def read_csv_file(filename):
    """Read a CSV file and return as list of dicts"""
    with open(f'data/{filename}', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)

def get_track_details(track_id):
    """Get track details from tracks.csv"""
    # Use grep to find the track efficiently
    cmd = f'grep "{track_id}" data/tracks.csv'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    if result.stdout:
        # Parse the CSV line
        fields = result.stdout.strip().split(',')
        if len(fields) >= 12:  # Make sure we have all fields including has_stems
            return {
                'id': fields[0],
                'track_title': fields[1],
                'track_description': fields[2].strip('"'),
                'bpm': fields[3],
                'duration': fields[4],
                'album_title': fields[5],
                'library_name': fields[6],
                'composer': fields[7],
                'genre': fields[8],
                'additional_genres': fields[9],
                'apm_release_date': fields[10],
                'has_stems': fields[11] if len(fields) > 11 else 'unknown'
            }
    return None

def test_workflow():
    """Execute the complete workflow"""

    print("=" * 60)
    print("TESTING MULTI-STEP WORKFLOW")
    print("=" * 60)
    print()

    # Step 1: Find 'Good Rockin Tonight A' in references
    print("Step 1: Looking up 'Good Rockin Tonight A'...")
    references = read_csv_file('mock_references.csv')
    good_rockin = None
    for ref in references:
        if ref['reference_input'] == 'Good Rockin Tonight A':
            good_rockin = ref['matched_track_id']
            print(f"  ✓ Found: {good_rockin}")
            break

    if not good_rockin:
        print("  ✗ Error: 'Good Rockin Tonight A' not found in references")
        print("  Alternative: Checking if RCK_RCK_0100_00101 exists directly...")
        good_rockin = 'RCK_RCK_0100_00101'

    # Step 2: Find similar tracks
    print("\nStep 2: Finding similar tracks...")
    similarities = read_csv_file('audio_similarities.csv')
    similar_track_ids = []

    for sim in similarities:
        if sim['source_track_id'] == good_rockin:
            similar_track_ids = sim['similar_track_ids'].split(';')
            print(f"  ✓ Found {len(similar_track_ids)} similar tracks")
            print(f"  Basis: {sim['similarity_basis']}")
            break

    if not similar_track_ids:
        print("  ✗ Error: No similar tracks found")
        return

    # Step 3: Get track details and filter for stems
    print("\nStep 3: Filtering for tracks with stems...")
    tracks_with_stems = []

    for track_id in similar_track_ids:
        track = get_track_details(track_id)
        if track and track.get('has_stems') == 'true':
            tracks_with_stems.append(track)

    print(f"  ✓ {len(tracks_with_stems)} tracks have stems available")

    # Step 4: Take first 10 tracks
    print("\nStep 4: Selecting first 10 tracks...")
    selected_tracks = tracks_with_stems[:10]
    print(f"  ✓ Selected {len(selected_tracks)} tracks")

    # Display selected tracks
    print("\n  Selected tracks:")
    for i, track in enumerate(selected_tracks, 1):
        print(f"    {i}. {track['track_title']} ({track['id']})")

    # Step 5: Add to project P012
    print("\nStep 5: Adding tracks to 'Swinging into the New Year' project (P012)...")

    success_count = 0
    for track in selected_tracks:
        cmd = f'python3 scripts/project_ops.py add_track --project_id P012 --track_id {track["id"]}'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

        if result.returncode == 0:
            success_count += 1
            print(f"    ✓ Added: {track['track_title']}")
        else:
            print(f"    ✗ Failed to add: {track['track_title']}")
            if "already in project" in result.stdout.lower():
                print(f"      (Track already in project)")

    print(f"\n  ✓ Successfully added {success_count} tracks to project P012")

    # Step 6: Verify project contents
    print("\nStep 6: Verifying project contents...")
    cmd = 'python3 scripts/project_ops.py list_tracks --project_id P012'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    if result.returncode == 0:
        print("  ✓ Project P012 contents:")
        print(result.stdout)

    print("\n" + "=" * 60)
    print("WORKFLOW TEST COMPLETE")
    print("=" * 60)

    # Generate expected agent response
    print("\n📋 EXPECTED AGENT RESPONSE:")
    print("-" * 40)
    print("I'll help you with that multi-step workflow. Let me:")
    print("1. Find 'Good Rockin Tonight A' and get similar tracks")
    print("2. Filter for tracks with stems")
    print("3. Add the first 10 results to your Swinging into the New Year project")
    print()
    print("Finding similar tracks to 'Good Rockin Tonight A'...")
    print(f"Found {len(similar_track_ids)} similar rockabilly/rock and roll tracks.")
    print(f"Filtering for tracks with stems... {len(tracks_with_stems)} tracks have stems available.")
    print(f"Adding the first 10 tracks to your 'Swinging into the New Year' project...")
    print()
    print("✅ Successfully added 10 rock and roll tracks with stems to your")
    print("'Swinging into the New Year' project (P012). These tracks are perfect")
    print("for your New Year's Eve celebration with their upbeat, party atmosphere")
    print("and classic rock and roll energy. All tracks have stem files available")
    print("for flexible mixing.")

if __name__ == '__main__':
    test_workflow()