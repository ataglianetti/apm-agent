#!/usr/bin/env python3
"""
Detailed test to verify each step of the workflow
"""

import csv

def test_detailed():
    """Test each step in detail"""

    print("=" * 60)
    print("DETAILED WORKFLOW TEST")
    print("=" * 60)
    print()

    # Step 1: Check Good Rockin Tonight A exists
    print("Step 1: Verifying 'Good Rockin Tonight A' exists...")

    # Check in tracks.csv
    with open('data/tracks.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        found_track = False
        for row in reader:
            if row['id'] == 'RCK_RCK_0100_00101':
                found_track = True
                print(f"  ✓ Found in tracks.csv: {row['track_title']}")
                print(f"    Has stems: {row['has_stems']}")
                break

    if not found_track:
        print("  ✗ RCK_RCK_0100_00101 not found in tracks.csv")
        return

    # Check in mock_references
    with open('data/mock_references.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        found_ref = False
        for row in reader:
            if row['reference_input'] == 'Good Rockin Tonight A':
                found_ref = True
                print(f"  ✓ Found in mock_references.csv")
                break

    if not found_ref:
        print("  ✗ Not found in mock_references.csv")

    # Step 2: Check audio similarities
    print("\nStep 2: Checking audio similarities...")
    with open('data/audio_similarities.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        similar_tracks = []
        for row in reader:
            if row['source_track_id'] == 'RCK_RCK_0100_00101':
                similar_tracks = row['similar_track_ids'].split(';')
                print(f"  ✓ Found {len(similar_tracks)} similar tracks")
                print(f"    Basis: {row['similarity_basis']}")
                break

    if not similar_tracks:
        print("  ✗ No similar tracks found")
        return

    # Step 3: Check each similar track for stems
    print("\nStep 3: Checking stems availability for similar tracks...")
    tracks_with_stems = []
    tracks_without_stems = []

    with open('data/tracks.csv', 'r', encoding='utf-8') as f:
        content = f.read()

    for track_id in similar_tracks:
        # Find the track in the CSV
        lines = content.split('\n')
        for line in lines:
            if line.startswith(track_id + ','):
                # Parse the line to get has_stems
                # The has_stems field is the last field
                fields = line.split(',')
                # Get the last field (has_stems)
                has_stems = fields[-1] if len(fields) > 11 else 'unknown'

                if has_stems == 'true':
                    tracks_with_stems.append(track_id)
                else:
                    tracks_without_stems.append(track_id)
                break

    print(f"  ✓ Tracks with stems: {len(tracks_with_stems)}")
    print(f"  ✗ Tracks without stems: {len(tracks_without_stems)}")

    print("\n  Tracks with stems available:")
    for i, track_id in enumerate(tracks_with_stems[:10], 1):
        # Get track title
        for line in content.split('\n'):
            if line.startswith(track_id + ','):
                parts = line.split(',')
                if len(parts) > 1:
                    title = parts[1]
                    print(f"    {i}. {title} ({track_id})")
                    break

    # Step 4: Check project exists
    print("\nStep 4: Verifying 'Swinging into the New Year' project...")
    with open('data/projects.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        found_project = False
        for row in reader:
            if row['project_id'] == 'P012':
                found_project = True
                print(f"  ✓ Found project: {row['name']}")
                print(f"    Keywords: {row['keywords']}")
                break

    if not found_project:
        print("  ✗ Project P012 not found")

    print("\n" + "=" * 60)
    print("DETAILED TEST COMPLETE")
    print("=" * 60)

    # Summary
    print("\n📊 SUMMARY:")
    print(f"  • Good Rockin Tonight A exists: {'✓' if found_track else '✗'}")
    print(f"  • Similar tracks found: {len(similar_tracks)}")
    print(f"  • Tracks with stems: {len(tracks_with_stems)}")
    print(f"  • Project ready: {'✓' if found_project else '✗'}")

    if len(tracks_with_stems) < 10:
        print(f"\n⚠️  WARNING: Only {len(tracks_with_stems)} tracks have stems (need 10)")
        print("  The workflow will add fewer tracks than requested.")

if __name__ == '__main__':
    test_detailed()