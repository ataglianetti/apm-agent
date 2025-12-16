import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper function to escape shell arguments safely
function escapeShellArg(arg) {
  if (arg === null || arg === undefined) {
    return '';
  }
  // Convert to string and escape single quotes by replacing ' with '\''
  // Then wrap the entire string in single quotes
  const str = String(arg);
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

// Execute project operation via project_ops.py script
export async function executeProjectTool(action, params) {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'project_ops.py');

  try {
    let command;

    switch (action) {
      case 'add_track':
        if (!params.project_id || !params.track_id) {
          return { error: 'Missing required parameters: project_id and track_id' };
        }
        command = `python3 "${scriptPath}" add_track --project_id ${escapeShellArg(params.project_id)} --track_id ${escapeShellArg(params.track_id)}`;
        if (params.notes) {
          command += ` --notes ${escapeShellArg(params.notes)}`;
        }
        break;

      case 'add_multiple_tracks':
        if (!params.project_id || !params.track_ids || params.track_ids.length === 0) {
          return { error: 'Missing required parameters: project_id and track_ids array' };
        }
        // Add tracks one by one
        const results = [];
        for (const trackId of params.track_ids) {
          const addCommand = `python3 "${scriptPath}" add_track --project_id ${escapeShellArg(params.project_id)} --track_id ${escapeShellArg(trackId)}`;
          try {
            const { stdout } = await execPromise(addCommand);
            results.push({ track_id: trackId, success: true, message: stdout.trim() });
          } catch (error) {
            results.push({ track_id: trackId, success: false, error: error.message });
          }
        }
        return { action: 'add_multiple_tracks', results };

      case 'remove_track':
        if (!params.project_id || !params.track_id) {
          return { error: 'Missing required parameters: project_id and track_id' };
        }
        command = `python3 "${scriptPath}" remove_track --project_id ${escapeShellArg(params.project_id)} --track_id ${escapeShellArg(params.track_id)}`;
        break;

      case 'list_tracks':
        if (!params.project_id) {
          return { error: 'Missing required parameter: project_id' };
        }
        command = `python3 "${scriptPath}" list_tracks --project_id ${escapeShellArg(params.project_id)}`;
        break;

      case 'create_project':
        if (!params.name) {
          return { error: 'Missing required parameter: name' };
        }
        command = `python3 "${scriptPath}" create_project --name ${escapeShellArg(params.name)}`;
        if (params.description) {
          command += ` --description ${escapeShellArg(params.description)}`;
        }
        if (params.for_field) {
          command += ` --for_field ${escapeShellArg(params.for_field)}`;
        }
        if (params.keywords) {
          command += ` --keywords ${escapeShellArg(params.keywords)}`;
        }
        if (params.deadline) {
          command += ` --deadline ${escapeShellArg(params.deadline)}`;
        }
        if (params.collaborators) {
          command += ` --collaborators ${escapeShellArg(params.collaborators)}`;
        }
        break;

      default:
        return { error: `Unknown action: ${action}` };
    }

    // Execute the command
    const { stdout, stderr } = await execPromise(command);

    if (stderr && !stderr.includes('WARNING')) {
      return { error: stderr };
    }

    return { success: true, output: stdout.trim() };

  } catch (error) {
    return { error: error.message };
  }
}