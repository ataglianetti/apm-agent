#!/usr/bin/env python3
"""
Add 'Good Rockin Tonight A' reference to mock_references.csv with correct fields
"""

import csv
import shutil

def add_to_mock_references():
    """Add reference mapping to mock_references.csv"""

    input_file = 'data/mock_references.csv'

    # Read existing data
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        existing_data = list(reader)
        fieldnames = reader.fieldnames

    # Add new reference mappings with correct fields
    new_entries = [
        {
            'reference_type': 'track_name',
            'reference_input': 'Good Rockin Tonight A',
            'matched_track_id': 'RCK_RCK_0100_00101',
            'reference_description': 'Classic rockabilly party anthem'
        },
        {
            'reference_type': 'track_name',
            'reference_input': 'Good Rockin Tonight',
            'matched_track_id': 'RCK_RCK_0100_00101',
            'reference_description': 'Classic rockabilly party anthem'
        },
        {
            'reference_type': 'aktrack',
            'reference_input': 'RCK_RCK_0100_00101',
            'matched_track_id': 'RCK_RCK_0100_00101',
            'reference_description': 'Good Rockin Tonight A - rockabilly classic'
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
    shutil.copy(input_file, 'data/mock_references_backup.csv')
    shutil.move(output_file, input_file)

    print("Successfully added 'Good Rockin Tonight A' references to mock_references.csv")

if __name__ == '__main__':
    add_to_mock_references()