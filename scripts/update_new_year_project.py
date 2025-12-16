#!/usr/bin/env python3
"""
Update P012 to be 'Swinging into the New Year' project
"""

import csv
import shutil
from datetime import datetime

def update_project():
    """Update P012 project name and details"""

    input_file = 'data/projects.csv'

    # Read existing data
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        projects = list(reader)
        fieldnames = reader.fieldnames

    # Update P012
    for project in projects:
        if project['project_id'] == 'P012':
            project['name'] = 'Swinging into the New Year'
            project['description'] = 'Upbeat, swing-inspired celebration music for New Year\'s Eve party. Classic rock and roll, rockabilly, and party anthems for the ultimate countdown celebration.'
            project['keywords'] = 'new years;swing;party;rockabilly;celebration;countdown;upbeat;rock and roll;dancing;festive'
            project['modified_on'] = datetime.now().strftime('%Y-%m-%d')
            break

    # Write back
    output_file = 'data/projects_updated.csv'
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(projects)

    # Backup and replace
    shutil.copy(input_file, 'data/projects_backup.csv')
    shutil.move(output_file, input_file)

    print("Updated P012 to 'Swinging into the New Year'")
    print("Project is now ready for adding rock and roll tracks!")

if __name__ == '__main__':
    update_project()