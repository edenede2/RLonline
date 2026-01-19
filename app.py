import os
import json
import datetime
from zoneinfo import ZoneInfo
from flask import Flask, request, jsonify, send_from_directory
import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

############################################################
# CONFIGURATION / GOOGLE SHEETS CLIENT
############################################################

# Google Drive folder ID extracted from the shared folder URL
# https://drive.google.com/drive/u/0/folders/1d5b2MuYbUFovp2p1h0QioYET5Jxk3ChL
DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "1R2Wq9u1KRL3Eb8-rnyoG1RCy1t-tGeHN")

def init_google_credentials():
    """
    Initialize Google credentials from GOOGLE_CREDENTIALS_JSON env var.
    Returns credentials object that can be used for both Sheets and Drive APIs.
    """
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", None)
    if creds_json is None:
        raise RuntimeError("GOOGLE_CREDENTIALS_JSON env var is not set")

    creds_dict = json.loads(creds_json)

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.readonly"
    ]
    creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    return creds, creds_dict


def init_gspread_client(creds):
    """
    Initialize gspread client from credentials.
    """
    gc = gspread.authorize(creds)
    return gc


def init_drive_service(creds):
    """
    Initialize Google Drive API service.
    """
    service = build('drive', 'v3', credentials=creds)
    return service


def list_spreadsheets_in_folder(drive_service, folder_id):
    """
    List all Google Spreadsheets in a specific Drive folder.
    Supports both regular Drive and Shared Drives.
    Returns list of {id, name} dicts.
    """
    query = f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    results = drive_service.files().list(
        q=query,
        spaces='drive',
        fields='files(id, name)',
        orderBy='name',
        supportsAllDrives=True,
        includeItemsFromAllDrives=True
    ).execute()
    
    files = results.get('files', [])
    return [{"id": f["id"], "name": f["name"]} for f in files]


# Initialize globals at import time
CREDENTIALS, CREDS_DICT = init_google_credentials()
GC = init_gspread_client(CREDENTIALS)
DRIVE_SERVICE = init_drive_service(CREDENTIALS)

# Dynamic spreadsheet storage - will be set per session
# Default to environment variable if set (for backwards compatibility)
SPREADSHEET = None
CURRENT_SHEET_ID = None

def get_or_init_spreadsheet(sheet_id=None):
    """
    Get the current spreadsheet or initialize with a specific sheet_id.
    If sheet_id is provided, switches to that spreadsheet.
    Falls back to SHEET_ID or SHEET_NAME env vars if no sheet_id provided.
    """
    global SPREADSHEET, CURRENT_SHEET_ID
    
    if sheet_id:
        SPREADSHEET = GC.open_by_key(sheet_id)
        CURRENT_SHEET_ID = sheet_id
        return SPREADSHEET
    
    if SPREADSHEET is not None:
        return SPREADSHEET
    
    # Fallback to environment variables for backwards compatibility
    env_sheet_id = os.environ.get("SHEET_ID", None)
    env_sheet_name = os.environ.get("SHEET_NAME", None)
    
    if env_sheet_id:
        SPREADSHEET = GC.open_by_key(env_sheet_id)
        CURRENT_SHEET_ID = env_sheet_id
    elif env_sheet_name:
        SPREADSHEET = GC.open(env_sheet_name)
        CURRENT_SHEET_ID = SPREADSHEET.id
    
    return SPREADSHEET

# Column orders for each sheet
TRIAL_SHEET_NAME = "TrialData"
BLOCK_SHEET_NAME = "BlockData"
TASK_SHEET_NAME  = "TaskData"

TRIAL_COLUMNS = [
    "sub_id",
    "timestamp",
    "block_number",
    "block_type",
    "trial_number",
    "trial_type",
    "valid_win",
    "valid_lose",
    "invalid_win",
    "invalid_lose",
    "sel_img1",
    "sel_img2",
    "sel_img3",
    "sel_img4",
    "left_image",
    "right_image",
    "left_right_flip",
    "reward_received",
    "trial_start",
    "trial_duration",
    "pair_type",
    "selected_side",
    "correct_side",
    "fixation_start_time",
    "fixation_end_time",
    "fixation_duration",
    "stimulus_start_time",
    "stimulus_end_time",
    "stimulus_duration",
    "feedback_start_time",
    "feedback_end_time",
    "feedback_duration"
]

BLOCK_COLUMNS = [
    "sub_id",
    "block_number",
    "block_type",
    "n_trials",
    "p_img1",
    "p_img2",
    "p_img3",
    "p_img4",
    "reward_count",
    "learner_status",
    "avg_reaction_duration",
    "std_reaction_duration",
    "avg_fixation_duration",
    "std_fixation_duration",
    "avg_stimulus_duration",
    "std_stimulus_duration",
    "avg_feedback_duration",
    "std_feedback_duration",
    "est_correct_reversed",
    "est_wrong_reversed",
    "est_correct_non_reversed",
    "est_wrong_non_reversed",
    "selected_left_count",
    "selected_right_count",
    "selected_left_percent"
]

TASK_COLUMNS = [
    "sub_id",
    "timestamp",
    "total_blocks",
    "learning_blocks",
    "reversal_blocks",
    "highest_reward_block",
    "learner_status",
    "total_rewards",
    "learning_rewards",
    "reversal_rewards",
    "fourth_learning_block_present",
    "avg_reaction_duration_learning",
    "std_reaction_duration_learning",
    "avg_reaction_duration_reversal",
    "std_reaction_duration_reversal",
    "avg_reaction_duration_total",
    "std_reaction_duration_total",
    "avg_fixation_duration_learning",
    "std_fixation_duration_learning",
    "avg_fixation_duration_reversal",
    "std_fixation_duration_reversal",
    "avg_fixation_duration_total",
    "std_fixation_duration_total",
    "avg_stimulus_duration_learning",
    "std_stimulus_duration_learning",
    "avg_stimulus_duration_reversal",
    "std_stimulus_duration_reversal",
    "avg_stimulus_duration_total",
    "std_stimulus_duration_total",
    "avg_feedback_duration_learning",
    "std_feedback_duration_learning",
    "avg_feedback_duration_reversal",
    "std_feedback_duration_reversal",
    "avg_feedback_duration_total",
    "std_feedback_duration_total",
    "selected_left_count",
    "selected_right_count",
    "selected_left_percent",
    "version",
    "isFinished"
]


def append_row(sheet_name, data_dict, columns_order, spreadsheet=None):
    """
    Append a row to a worksheet by mapping data_dict to the provided column order.
    If a key is missing in data_dict, an empty string is inserted.
    """
    ss = spreadsheet or get_or_init_spreadsheet()
    if ss is None:
        raise RuntimeError("No spreadsheet selected. Please select a project first.")
    ws = ss.worksheet(sheet_name)
    row_vals = [data_dict.get(col, "") for col in columns_order]
    # We use USER_ENTERED so numbers don't all become strings
    ws.append_row(row_vals, value_input_option="USER_ENTERED")


############################################################
# FLASK APP
############################################################

app = Flask(__name__)


@app.route("/")
def index():
    # Serve the main page (static/index.html)
    return send_from_directory("static", "index.html")


@app.route("/favicon.ico")
def favicon():
    # Return empty response for favicon to prevent 404
    return "", 204


@app.route("/static/<path:path>")
def send_static(path):
    # Serve static files (css/js etc.). Flask can already do this automatically
    # if app.static_folder == "static", but we provide this for clarity.
    return send_from_directory("static", path)


@app.route("/images/<path:filename>")
def serve_image(filename):
    # Serve experiment images (stimuli, feedback, instructions, etc.)
    return send_from_directory(os.path.join("static", "images"), filename)


def server_timestamp_iso():
    """Return current timestamp in Israel timezone (Asia/Jerusalem)."""
    israel_tz = ZoneInfo("Asia/Jerusalem")
    return datetime.datetime.now(israel_tz).isoformat(timespec="seconds")


############################################################
# PROJECT SELECTION ENDPOINTS
############################################################

@app.route("/get_projects", methods=["GET"])
def get_projects():
    """
    List all spreadsheets in the shared Google Drive folder.
    Returns a list of {id, name} objects.
    """
    try:
        print(f"[DEBUG] Attempting to list files in folder: {DRIVE_FOLDER_ID}")
        
        # First, try to get folder info to verify access (with Shared Drive support)
        try:
            folder_info = DRIVE_SERVICE.files().get(
                fileId=DRIVE_FOLDER_ID,
                fields='id, name, mimeType, driveId',
                supportsAllDrives=True
            ).execute()
            print(f"[DEBUG] Folder info: {folder_info}")
        except Exception as folder_err:
            print(f"[DEBUG] Could not get folder info: {folder_err}")
        
        # List ALL files in the folder first (any type) - with Shared Drive support
        query_all = f"'{DRIVE_FOLDER_ID}' in parents and trashed=false"
        print(f"[DEBUG] Query for all files: {query_all}")
        
        all_files_result = DRIVE_SERVICE.files().list(
            q=query_all,
            spaces='drive',
            fields='files(id, name, mimeType)',
            orderBy='name',
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        
        all_files = all_files_result.get('files', [])
        print(f"[DEBUG] All files in folder ({len(all_files)}): {all_files}")
        
        # Now filter for spreadsheets only
        spreadsheets = list_spreadsheets_in_folder(DRIVE_SERVICE, DRIVE_FOLDER_ID)
        print(f"[DEBUG] Spreadsheets found: {spreadsheets}")
        
        # Get service account email for sharing instructions
        service_account_email = CREDS_DICT.get("client_email", "unknown")

        
        return jsonify({
            "status": "ok", 
            "projects": spreadsheets,
            "debug": {
                "folder_id": DRIVE_FOLDER_ID,
                "all_files_count": len(all_files),
                "all_files": all_files,
                "spreadsheets_count": len(spreadsheets),
                "service_account_email": service_account_email,
                "sharing_instructions": f"Share the Google Drive folder with this email: {service_account_email}"
            }
        })
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[DEBUG] Error in get_projects: {error_trace}")
        
        # Get service account email even on error
        service_account_email = CREDS_DICT.get("client_email", "unknown")
        
        return jsonify({
            "status": "error", 
            "message": str(e),
            "debug": {
                "folder_id": DRIVE_FOLDER_ID,
                "traceback": error_trace,
                "service_account_email": service_account_email
            }
        }), 500


@app.route("/select_project", methods=["POST"])
def select_project():
    """
    Select a specific spreadsheet to use for data recording.
    Expected JSON: {"sheet_id": "...", "sheet_name": "..."}
    """
    data = request.get_json(force=True, silent=False)
    sheet_id = data.get("sheet_id")
    sheet_name = data.get("sheet_name", "Unknown")
    
    if not sheet_id:
        return jsonify({"status": "error", "message": "sheet_id is required"}), 400
    
    try:
        spreadsheet = get_or_init_spreadsheet(sheet_id)
        return jsonify({
            "status": "ok", 
            "message": f"Selected project: {sheet_name}",
            "sheet_id": sheet_id,
            "sheet_name": spreadsheet.title
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/get_current_project", methods=["GET"])
def get_current_project():
    """
    Get the currently selected project/spreadsheet.
    """
    ss = get_or_init_spreadsheet()
    if ss is None:
        return jsonify({"status": "ok", "project": None})
    return jsonify({
        "status": "ok", 
        "project": {
            "id": CURRENT_SHEET_ID,
            "name": ss.title
        }
    })


############################################################
# DATA LOGGING ENDPOINTS
############################################################

@app.route("/log_trial", methods=["POST"])
def log_trial():
    """
    Receive JSON for a single trial and append it to TrialData sheet.
    Expected JSON keys match TRIAL_COLUMNS.
    We'll also inject server timestamp if not provided.
    """
    data = request.get_json(force=True, silent=False)

    if "timestamp" not in data or not data["timestamp"]:
        data["timestamp"] = server_timestamp_iso()

    try:
        append_row(TRIAL_SHEET_NAME, data, TRIAL_COLUMNS)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "ok"})


@app.route("/log_trials_bulk", methods=["POST"])
def log_trials_bulk():
    """
    Receive JSON array of trial data and append all to TrialData sheet.
    Expected format: {"trials": [{trial1}, {trial2}, ...]}
    """
    data = request.get_json(force=True, silent=False)
    trials = data.get("trials", [])

    try:
        ss = get_or_init_spreadsheet()
        if ss is None:
            return jsonify({"status": "error", "message": "No spreadsheet selected"}), 400
        ws = ss.worksheet(TRIAL_SHEET_NAME)
        rows = []
        for trial in trials:
            if "timestamp" not in trial or not trial["timestamp"]:
                trial["timestamp"] = server_timestamp_iso()
            row_vals = [trial.get(col, "") for col in TRIAL_COLUMNS]
            rows.append(row_vals)
        
        if rows:
            ws.append_rows(rows, value_input_option="USER_ENTERED")
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "ok", "rows_added": len(rows)})


@app.route("/log_block", methods=["POST"])
def log_block():
    """
    Receive JSON for a completed block and append to BlockData.
    Expected keys match BLOCK_COLUMNS.
    """
    data = request.get_json(force=True, silent=False)

    # Optionally stamp server time? Spec doesn't require.
    try:
        append_row(BLOCK_SHEET_NAME, data, BLOCK_COLUMNS)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "ok"})


@app.route("/log_task", methods=["POST"])
def log_task():
    """
    Receive JSON for task summary and update/insert to TaskData.
    If a row with the same sub_id exists, it will be updated.
    Otherwise, a new row will be appended.
    Expected keys match TASK_COLUMNS.
    Uses batch update for efficiency.
    """
    data = request.get_json(force=True, silent=False)

    if "timestamp" not in data or not data["timestamp"]:
        data["timestamp"] = server_timestamp_iso()

    try:
        ss = get_or_init_spreadsheet()
        if ss is None:
            return jsonify({"status": "error", "message": "No spreadsheet selected"}), 400
        ws = ss.worksheet(TASK_SHEET_NAME)
        sub_id = data.get("sub_id", "")
        
        # Find existing row with same sub_id
        existing_row = None
        try:
            cell = ws.find(str(sub_id), in_column=1)  # sub_id is first column
            if cell:
                existing_row = cell.row
        except gspread.exceptions.CellNotFound:
            existing_row = None
        
        row_vals = [data.get(col, "") for col in TASK_COLUMNS]
        
        if existing_row:
            # Batch update existing row (much faster than individual cell updates)
            num_cols = len(TASK_COLUMNS)
            end_col = chr(ord('A') + num_cols - 1) if num_cols <= 26 else 'A' + chr(ord('A') + num_cols - 27)
            # Convert column number to letter(s)
            def col_to_letter(col):
                result = ""
                while col > 0:
                    col, remainder = divmod(col - 1, 26)
                    result = chr(65 + remainder) + result
                return result
            end_col_letter = col_to_letter(num_cols)
            cell_range = f"A{existing_row}:{end_col_letter}{existing_row}"
            ws.update(cell_range, [row_vals], value_input_option="USER_ENTERED")
        else:
            # Append new row
            ws.append_row(row_vals, value_input_option="USER_ENTERED")
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "ok"})


@app.route("/log_block_complete", methods=["POST"])
def log_block_complete():
    """
    Combined endpoint to log all block data at once (trials, block summary, task update).
    This reduces network round-trips from 3 to 1.
    Expected format: {
        "trials": [{trial1}, {trial2}, ...],
        "block": {block data},
        "task": {task data}
    }
    """
    data = request.get_json(force=True, silent=False)
    trials = data.get("trials", [])
    block_data = data.get("block", {})
    task_data = data.get("task", {})
    
    errors = []
    
    ss = get_or_init_spreadsheet()
    if ss is None:
        return jsonify({"status": "error", "message": "No spreadsheet selected"}), 400
    
    # 1. Log trials in bulk
    try:
        if trials:
            ws = ss.worksheet(TRIAL_SHEET_NAME)
            rows = []
            for trial in trials:
                if "timestamp" not in trial or not trial["timestamp"]:
                    trial["timestamp"] = server_timestamp_iso()
                row_vals = [trial.get(col, "") for col in TRIAL_COLUMNS]
                rows.append(row_vals)
            if rows:
                ws.append_rows(rows, value_input_option="USER_ENTERED")
    except Exception as e:
        errors.append(f"trials: {str(e)}")
    
    # 2. Log block data
    try:
        if block_data:
            append_row(BLOCK_SHEET_NAME, block_data, BLOCK_COLUMNS, ss)
    except Exception as e:
        errors.append(f"block: {str(e)}")
    
    # 3. Update/insert task data
    try:
        if task_data:
            if "timestamp" not in task_data or not task_data["timestamp"]:
                task_data["timestamp"] = server_timestamp_iso()
            
            ws = ss.worksheet(TASK_SHEET_NAME)
            sub_id = task_data.get("sub_id", "")
            
            existing_row = None
            try:
                cell = ws.find(str(sub_id), in_column=1)
                if cell:
                    existing_row = cell.row
            except gspread.exceptions.CellNotFound:
                existing_row = None
            
            row_vals = [task_data.get(col, "") for col in TASK_COLUMNS]
            
            if existing_row:
                def col_to_letter(col):
                    result = ""
                    while col > 0:
                        col, remainder = divmod(col - 1, 26)
                        result = chr(65 + remainder) + result
                    return result
                end_col_letter = col_to_letter(len(TASK_COLUMNS))
                cell_range = f"A{existing_row}:{end_col_letter}{existing_row}"
                ws.update(cell_range, [row_vals], value_input_option="USER_ENTERED")
            else:
                ws.append_row(row_vals, value_input_option="USER_ENTERED")
    except Exception as e:
        errors.append(f"task: {str(e)}")
    
    if errors:
        return jsonify({"status": "partial_error", "errors": errors}), 500
    
    return jsonify({"status": "ok", "trials_added": len(trials)})


# Sheet name for backup trial data
LOG_DATA_SHEET_NAME = "logData"

@app.route("/log_backup_trials", methods=["POST"])
def log_backup_trials():
    """
    Backup endpoint to log all trial data at experiment end.
    This serves as a safety net in case between-block saves failed.
    Expected format: {
        "sub_id": "...",
        "trials": [{trial1}, {trial2}, ...]
    }
    """
    data = request.get_json(force=True, silent=False)
    sub_id = data.get("sub_id", "")
    trials = data.get("trials", [])
    
    if not trials:
        return jsonify({"status": "ok", "message": "No trials to backup", "trials_added": 0})
    
    try:
        ss = get_or_init_spreadsheet()
        if ss is None:
            return jsonify({"status": "error", "message": "No spreadsheet selected"}), 400
        # Get or create the logData sheet
        try:
            ws = ss.worksheet(LOG_DATA_SHEET_NAME)
        except gspread.exceptions.WorksheetNotFound:
            # Create the sheet with headers if it doesn't exist
            ws = ss.add_worksheet(title=LOG_DATA_SHEET_NAME, rows=1000, cols=len(TRIAL_COLUMNS))
            ws.append_row(TRIAL_COLUMNS, value_input_option="USER_ENTERED")
        
        # Prepare rows for bulk insert
        rows = []
        for trial in trials:
            if "timestamp" not in trial or not trial["timestamp"]:
                trial["timestamp"] = server_timestamp_iso()
            row_vals = [trial.get(col, "") for col in TRIAL_COLUMNS]
            rows.append(row_vals)
        
        if rows:
            ws.append_rows(rows, value_input_option="USER_ENTERED")
        
        return jsonify({"status": "ok", "trials_added": len(rows)})
    
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


############################################################
# DEV ENTRY POINT
############################################################

if __name__ == "__main__":
    # For local testing only. On Heroku we'll run via Gunicorn.
    port = int(os.environ.get("PORT", 5005))
    app.run(host="0.0.0.0", port=port, debug=True)
