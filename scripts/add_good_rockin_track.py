#!/usr/bin/env python3
"""
Add 'Good Rockin Tonight A' as an actual track to tracks.csv and mock_references.csv
"""

import csv
import shutil
from datetime import datetime

def add_to_tracks_csv():
    """Add Good Rockin Tonight A to tracks.csv"""

    # New track entry
    new_track = {
        'id': 'RCK_RCK_0100_00101',
        'track_title': 'Good Rockin Tonight A',
        'track_description': 'High-energy rockabilly classic with driving rhythm guitar, upbeat drums, and party atmosphere. Perfect for celebration and retro vibes.',
        'bpm': '148',
        'duration': '152',
        'album_title': 'ROCKABILLY CLASSICS VOL 1',
        'library_name': 'Rock Classics',
        'composer': 'Roy Brown',
        'genre': '1353',  # Rockabilly genre
        'additional_genres': '1352;2131;2161',  # Rock & Roll 50s, Party/Celebration, Retro
        'apm_release_date': '03/15/2024',
        'has_stems': 'true'  # Important: has stems so workflow will work
    }

    # Read existing tracks
    input_file = 'data/tracks.csv'

    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Simply append the new track as a new line
    new_line = ','.join([
        new_track['id'],
        new_track['track_title'],
        f'"{new_track["track_description"]}"',  # Quote description due to commas
        new_track['bpm'],
        new_track['duration'],
        new_track['album_title'],
        new_track['library_name'],
        new_track['composer'],
        new_track['genre'],
        new_track['additional_genres'],
        new_track['apm_release_date'],
        new_track['has_stems']
    ])

    # Backup and update
    shutil.copy(input_file, 'data/tracks_before_good_rockin.csv')

    # Append to file
    with open(input_file, 'a', encoding='utf-8') as f:
        f.write('\n' + new_line)

    print("Added 'Good Rockin Tonight A' to tracks.csv")

def add_to_mock_references():
    """Add reference mapping to mock_references.csv"""

    input_file = 'data/mock_references.csv'

    # Read existing data
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        existing_data = list(reader)
        fieldnames = reader.fieldnames

    # Add new reference mappings
    new_entries = [
        {
            'reference_type': 'track_name',
            'reference_input': 'Good Rockin Tonight A',
            'matched_track_id': 'RCK_RCK_0100_00101',
            'confidence_score': '1.00'
        },
        {
            'reference_type': 'track_name',
            'reference_input': 'Good Rockin Tonight',
            'matched_track_id': 'RCK_RCK_0100_00101',
            'confidence_score': '0.95'
        }
    ]

    # Add new entries
    existing_data.extend(new_entries)

    # Write back
    output_file = 'data/mock_references_updated.csv'
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(existing_data)

    # Backup and replace
    shutil.copy(input_file, 'data/mock_references_original.csv')
    shutil.move(output_file, input_file)

    print("Added 'Good Rockin Tonight A' references to mock_references.csv")

if __name__ == '__main__':
    add_to_tracks_csv()
    add_to_mock_references()
    print("Complete! Good Rockin Tonight A is now fully integrated.")