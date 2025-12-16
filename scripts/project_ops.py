#!/usr/bin/env python3
"""
Project Operations for APM Agent Prototype

Usage:
    python scripts/project_ops.py create_project --name "Project Name" --description "Description" --for_field "TV Commercial" --keywords "key1;key2" --deadline "2025-12-31" --collaborators "Person 1;Person 2"
    python scripts/project_ops.py add_track --project_id P001 --track_id NFL_NFL_0036_01901 --notes "Optional notes"
    python scripts/project_ops.py remove_track --project_id P001 --track_id NFL_NFL_0036_01901
    python scripts/project_ops.py list_tracks --project_id P001
"""

import argparse
import csv
import os
import sys
from datetime import datetime

# Paths relative to script location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
PROJECTS_FILE = os.path.join(DATA_DIR, 'projects.csv')
PROJECT_TRACKS_FILE = os.path.join(DATA_DIR, 'project_tracks.csv')
TRACKS_FILE = os.path.join(DATA_DIR, 'tracks.csv')


def get_next_project_id():
    """Get the next available project ID (P001, P002, etc.)"""
    with open(PROJECTS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        max_id = 0
        for row in reader:
            pid = int(row['project_id'].replace('P', ''))
            max_id = max(max_id, pid)
    return f'P{max_id + 1:03d}'


def validate_track_exists(track_id):
    """Check if a track ID exists in the catalog"""
    with open(TRACKS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['id'] == track_id:
                return True
    return False


def validate_project_exists(project_id):
    """Check if a project ID exists"""
    with open(PROJECTS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['project_id'] == project_id:
                return True
    return False


def get_next_position(project_id):
    """Get the next position number for a track in a project"""
    max_pos = 0
    with open(PROJECT_TRACKS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['project_id'] == project_id:
                max_pos = max(max_pos, int(row['position']))
    return max_pos + 1


def track_in_project(project_id, track_id):
    """Check if a track is already in a project"""
    with open(PROJECT_TRACKS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['project_id'] == project_id and row['track_id'] == track_id:
                return True
    return False


def create_project(name, description, for_field, keywords, deadline, collaborators):
    """Create a new project"""
    project_id = get_next_project_id()
    today = datetime.now().strftime('%Y-%m-%d')

    new_row = {
        'project_id': project_id,
        'name': name,
        'description': description,
        'for_field': for_field,
        'keywords': keywords,
        'created_on': today,
        'modified_on': today,
        'status': 'Active',
        'deadline': deadline,
        'collaborators': collaborators
    }

    # Read existing data
    with open(PROJECTS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # Append new row
    rows.append(new_row)

    # Write back
    with open(PROJECTS_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"✓ Created project {project_id}: {name}")
    print(f"  Description: {description}")
    print(f"  For: {for_field}")
    print(f"  Deadline: {deadline}")
    return project_id


def add_track(project_id, track_id, notes=''):
    """Add a track to a project"""
    # Validate project exists
    if not validate_project_exists(project_id):
        print(f"✗ Error: Project {project_id} does not exist")
        sys.exit(1)

    # Validate track exists
    if not validate_track_exists(track_id):
        print(f"✗ Error: Track {track_id} does not exist in catalog")
        sys.exit(1)

    # Check if already in project
    if track_in_project(project_id, track_id):
        print(f"✗ Error: Track {track_id} is already in project {project_id}")
        sys.exit(1)

    # Get next position
    position = get_next_position(project_id)
    today = datetime.now().strftime('%Y-%m-%d')

    new_row = {
        'project_id': project_id,
        'track_id': track_id,
        'added_date': today,
        'position': position,
        'notes': notes
    }

    # Read existing data
    with open(PROJECT_TRACKS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # Append new row
    rows.append(new_row)

    # Write back
    with open(PROJECT_TRACKS_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Update project modified_on date
    update_project_modified(project_id)

    # Get track title for confirmation
    track_title = get_track_title(track_id)
    print(f"✓ Added track to {project_id} at position {position}")
    print(f"  Track: {track_title} ({track_id})")
    if notes:
        print(f"  Notes: {notes}")


def remove_track(project_id, track_id):
    """Remove a track from a project"""
    # Read existing data
    with open(PROJECT_TRACKS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # Find and remove the track
    original_len = len(rows)
    rows = [r for r in rows if not (r['project_id'] == project_id and r['track_id'] == track_id)]

    if len(rows) == original_len:
        print(f"✗ Error: Track {track_id} not found in project {project_id}")
        sys.exit(1)

    # Write back
    with open(PROJECT_TRACKS_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Update project modified_on date
    update_project_modified(project_id)

    track_title = get_track_title(track_id)
    print(f"✓ Removed track from {project_id}")
    print(f"  Track: {track_title} ({track_id})")


def list_tracks(project_id):
    """List all tracks in a project"""
    if not validate_project_exists(project_id):
        print(f"✗ Error: Project {project_id} does not exist")
        sys.exit(1)

    # Get project info
    project_name = get_project_name(project_id)

    # Get tracks
    tracks = []
    with open(PROJECT_TRACKS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['project_id'] == project_id:
                track_title = get_track_title(row['track_id'])
                tracks.append({
                    'position': int(row['position']),
                    'track_id': row['track_id'],
                    'title': track_title,
                    'added_date': row['added_date'],
                    'notes': row['notes']
                })

    tracks.sort(key=lambda x: x['position'])

    print(f"Project: {project_name} ({project_id})")
    print(f"Tracks: {len(tracks)}")
    print("-" * 60)

    for t in tracks:
        notes_str = f" - {t['notes']}" if t['notes'] else ""
        print(f"  {t['position']}. {t['title']}")
        print(f"     {t['track_id']} (added {t['added_date']}){notes_str}")


def get_track_title(track_id):
    """Get track title from ID"""
    with open(TRACKS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['id'] == track_id:
                return row['track_title']
    return "Unknown"


def get_project_name(project_id):
    """Get project name from ID"""
    with open(PROJECTS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['project_id'] == project_id:
                return row['name']
    return "Unknown"


def update_project_modified(project_id):
    """Update the modified_on date for a project"""
    today = datetime.now().strftime('%Y-%m-%d')

    with open(PROJECTS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    for row in rows:
        if row['project_id'] == project_id:
            row['modified_on'] = today
            break

    with open(PROJECTS_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description='APM Agent Project Operations')
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # create_project command
    create_parser = subparsers.add_parser('create_project', help='Create a new project')
    create_parser.add_argument('--name', required=True, help='Project name')
    create_parser.add_argument('--description', required=True, help='Project description')
    create_parser.add_argument('--for_field', required=True, help='What the project is for (e.g., TV Commercial)')
    create_parser.add_argument('--keywords', default='', help='Keywords separated by semicolons')
    create_parser.add_argument('--deadline', required=True, help='Deadline date (YYYY-MM-DD)')
    create_parser.add_argument('--collaborators', default='', help='Collaborators separated by semicolons')

    # add_track command
    add_parser = subparsers.add_parser('add_track', help='Add a track to a project')
    add_parser.add_argument('--project_id', required=True, help='Project ID (e.g., P001)')
    add_parser.add_argument('--track_id', required=True, help='Track ID (e.g., NFL_NFL_0036_01901)')
    add_parser.add_argument('--notes', default='', help='Optional notes')

    # remove_track command
    remove_parser = subparsers.add_parser('remove_track', help='Remove a track from a project')
    remove_parser.add_argument('--project_id', required=True, help='Project ID')
    remove_parser.add_argument('--track_id', required=True, help='Track ID')

    # list_tracks command
    list_parser = subparsers.add_parser('list_tracks', help='List tracks in a project')
    list_parser.add_argument('--project_id', required=True, help='Project ID')

    args = parser.parse_args()

    if args.command == 'create_project':
        create_project(args.name, args.description, args.for_field,
                      args.keywords, args.deadline, args.collaborators)
    elif args.command == 'add_track':
        add_track(args.project_id, args.track_id, args.notes)
    elif args.command == 'remove_track':
        remove_track(args.project_id, args.track_id)
    elif args.command == 'list_tracks':
        list_tracks(args.project_id)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
