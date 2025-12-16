#!/usr/bin/env python3
"""
Script to add has_stems column to tracks.csv with realistic distribution
"""

import csv
import random
from datetime import datetime

def should_have_stems(track):
    """
    Determine if a track should have stems based on realistic criteria:
    - Newer releases more likely (post-2020: 70%, 2015-2020: 50%, pre-2015: 30%)
    - Certain libraries more likely (KPM, BRU, NFL: 65%, others: 45%)
    - Certain genres more likely (Electronic, Pop, Hip Hop higher probability)
    """

    # Parse release date
    release_date_str = track.get('apm_release_date', '')
    try:
        if release_date_str:
            release_date = datetime.strptime(release_date_str, '%m/%d/%Y')
            year = release_date.year
        else:
            year = 2015  # Default to middle probability
    except:
        year = 2015

    # Base probability based on year
    if year >= 2020:
        base_prob = 0.70
    elif year >= 2015:
        base_prob = 0.50
    else:
        base_prob = 0.30

    # Adjust for library
    library = track.get('library_name', '')
    if any(lib in library for lib in ['KPM', 'BRU', 'NFL', 'MPATH']):
        base_prob += 0.15
    elif any(lib in library for lib in ['AXS', 'CEZ', 'PMY']):
        base_prob += 0.10

    # Adjust for genre (electronic, pop, hip hop genres more likely)
    genre_id = track.get('genre', '')
    # Electronic genres (1400s), Pop (1500s), Hip Hop (1340s) more likely
    if genre_id.startswith('14') or genre_id.startswith('15') or genre_id.startswith('134'):
        base_prob += 0.10

    # Cap probability at 0.85
    base_prob = min(base_prob, 0.85)

    return random.random() < base_prob

def add_stems_column():
    """Add has_stems column to tracks.csv"""

    input_file = 'data/tracks.csv'
    output_file = 'data/tracks_with_stems.csv'

    with open(input_file, 'r', encoding='utf-8') as infile:
        reader = csv.DictReader(infile)
        fieldnames = reader.fieldnames + ['has_stems']

        with open(output_file, 'w', newline='', encoding='utf-8') as outfile:
            writer = csv.DictWriter(outfile, fieldnames=fieldnames)
            writer.writeheader()

            total_tracks = 0
            tracks_with_stems = 0

            for row in reader:
                row['has_stems'] = 'true' if should_have_stems(row) else 'false'
                if row['has_stems'] == 'true':
                    tracks_with_stems += 1
                total_tracks += 1
                writer.writerow(row)

                if total_tracks % 1000 == 0:
                    print(f"Processed {total_tracks} tracks...")

            print(f"\nComplete! Processed {total_tracks} tracks")
            print(f"Tracks with stems: {tracks_with_stems} ({tracks_with_stems/total_tracks*100:.1f}%)")

    # Replace original file
    import os
    import shutil

    # Backup original
    shutil.copy(input_file, 'data/tracks_original.csv')
    print("Original backed up to data/tracks_original.csv")

    # Replace with new version
    shutil.move(output_file, input_file)
    print("tracks.csv updated with has_stems column")

if __name__ == '__main__':
    # Set seed for reproducibility
    random.seed(42)
    add_stems_column()