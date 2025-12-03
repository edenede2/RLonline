import os
import json
import datetime
from flask import Flask, request, jsonify, send_from_directory

import gspread
from google.oauth2.service_account import Credentials

############################################################
# CONFIGURATION / GOOGLE SHEETS CLIENT
############################################################

def init_gspread_client():
    """
    Initialize gspread client from GOOGLE_CREDENTIALS_JSON env var.
    The env var should contain the full service account JSON as a string.
    The service account must have edit access to the Google Sheet.
    """
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", None)
    if creds_json is None:
        raise RuntimeError("GOOGLE_CREDENTIALS_JSON env var is not set")

    creds_dict = json.loads(creds_json)

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc = gspread.authorize(creds)
    return gc


def init_spreadsheet(gc):
    """
    Open spreadsheet either by SHEET_ID or SHEET_NAME.
    SHEET_ID is recommended (the long ID from the URL).
    """
    sheet_id = os.environ.get("SHEET_ID", None)
    sheet_name = os.environ.get("SHEET_NAME", None)

    if sheet_id:
        sh = gc.open_by_key(sheet_id)
    elif sheet_name:
        sh = gc.open(sheet_name)
    else:
        raise RuntimeError("Must define SHEET_ID or SHEET_NAME env var")

    return sh


# Initialize globals at import time
GC = init_gspread_client()
SPREADSHEET = init_spreadsheet(GC)

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
    "version",
    "fixation_start_date",
    "fixation_start_time",
    "fixation_end_date",
    "fixation_end_time",
    "fixation_duration",
    "stimulus_start_date",
    "stimulus_start_time",
    "stimulus_end_date",
    "stimulus_end_time",
    "stimulus_duration",
    "feedback_start_date",
    "feedback_start_time",
    "feedback_end_date",
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
    "est_correct_pair1",
    "est_wrong_pair1",
    "est_correct_pair2",
    "est_wrong_pair2",
    "selected_left_count",
    "selected_right_count",
    "selected_left_percent",
    "version"
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
    "version"
]


def append_row(sheet_name, data_dict, columns_order):
    """
    Append a row to a worksheet by mapping data_dict to the provided column order.
    If a key is missing in data_dict, an empty string is inserted.
    """
    ws = SPREADSHEET.worksheet(sheet_name)
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
    return datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"


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
        ws = SPREADSHEET.worksheet(TRIAL_SHEET_NAME)
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
    Receive JSON for final summary of the task and append to TaskData.
    Expected keys match TASK_COLUMNS.
    We'll also ensure timestamp is set.
    """
    data = request.get_json(force=True, silent=False)

    if "timestamp" not in data or not data["timestamp"]:
        data["timestamp"] = server_timestamp_iso()

    try:
        append_row(TASK_SHEET_NAME, data, TASK_COLUMNS)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "ok"})


############################################################
# DEV ENTRY POINT
############################################################

if __name__ == "__main__":
    # For local testing only. On Heroku we'll run via Gunicorn.
    port = int(os.environ.get("PORT", 5005))
    app.run(host="0.0.0.0", port=port, debug=True)
