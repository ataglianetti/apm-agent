#!/usr/bin/env python3
"""
Add 'Good Rockin Tonight A' to audio_similarities.csv with similar rock/rockabilly tracks
"""

import csv
import os
import shutil

def add_good_rockin_tonight():
    """Add the Good Rockin Tonight A entry to audio_similarities.csv"""

    # Track IDs that have stems and are similar in style to Good Rockin Tonight
    # These are rockabilly, rock n roll, and classic rock tracks with has_stems=true
    similar_tracks = [
        'SOHO_SOHO_0363_04101',  # Rockin Blues Stomp - rockabilly (has_stems=true)
        'BRU_BTV_0299_05801',    # Crafty Kids - rock n roll (has_stems=true)
        'NFL_NFL_0010_00101',    # New Attitude - classic rock (has_stems=true)
        'SOHO_SOHO_0285_05901',  # Twist Party - rock n roll (has_stems=true)
        'MYMA_SCOP_0061_02301',  # Do We Doo Wap - 60s rock n roll (has_stems=true)
        'MTA_MTA_0058_03501',    # South - upbeat rock (has_stems=true)
        'CHR_CHR_0042_02301',    # Lets Get Some Love - classic rock (has_stems=true)
        'JCM_JM_0150_05301',     # Grenadier - 70s rock (has_stems=true)
        'BRU_BURN_0053_00901',   # Back To Hell - classic rock (has_stems=true)
        'MTA_MTA_0001_02901',    # Coldkicks Faster - classic rock (has_stems=true)
        'SOHO_SOHO_0236_06701',  # Dancing Shoes - rock and roll (has_stems=true)
        'MTA_MTA_0062_39101',    # Victorious - classic rock (has_stems=true)
    ]

    # Create the new entry
    new_entry = {
        'source_track_id': 'RCK_RCK_0100_00101',  # Good Rockin Tonight A
        'similar_track_ids': ';'.join(similar_tracks[:15]),  # Take up to 15 tracks
        'similarity_basis': 'rockabilly;rock and roll;classic rock;upbeat;party'
    }

    # Read existing file
    input_file = 'data/audio_similarities.csv'

    # Read all existing data
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        existing_data = list(reader)
        fieldnames = reader.fieldnames

    # Add new entry
    existing_data.append(new_entry)

    # Write back
    output_file = 'data/audio_similarities_updated.csv'
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(existing_data)

    # Backup and replace
    shutil.copy(input_file, 'data/audio_similarities_original.csv')
    shutil.move(output_file, input_file)

    print(f"Added 'Good Rockin Tonight A' (RCK_RCK_0100_00101) to audio_similarities.csv")
    print(f"Mapped to {len(similar_tracks)} similar tracks with stems")

if __name__ == '__main__':
    add_good_rockin_tonight()