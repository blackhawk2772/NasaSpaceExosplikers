import json
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd
from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    send_from_directory,
    url_for,
)
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
SCRIPT_PATH = BASE_DIR / "scripts" / "model_selector.py"

UPLOAD_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = str(UPLOAD_DIR)
app.secret_key = "space-apps-secret"

ALLOWED_EXTENSIONS = {"csv"}
MODEL_CHOICES = ("TESS", "KEPLER", "K2")
MAX_ROWS = 200

STATUS_CONFIG = {
    0: {"label": "Candidate", "css_class": "prediction-candidate"},
    1: {"label": "Confirmed", "css_class": "prediction-confirmed"},
    2: {"label": "False Positive", "css_class": "prediction-false-positive"},
}
DEFAULT_STATUS = {"label": "Unknown", "css_class": "prediction-unknown"}

MISSION_DESCRIPTIONS = {
    "KEPLER": [
        "Kepler Mission (2009–2018): NASA's Kepler telescope was designed to discover Earth-like exoplanets by monitoring the brightness of over 150,000 stars in a fixed patch of the sky.",
        "Using the transit method, it detected dips in starlight caused by planets crossing in front of their host stars and revolutionized exoplanet science with thousands of discoveries.",
        "Kepler showed that planets are commonplace throughout the galaxy."
    ],
    "K2": [
        "K2 Mission (2014–2018): After two of Kepler's reaction wheels failed, the telescope was repurposed for the K2 mission using solar pressure to maintain pointing stability.",
        "K2 observed fields along the ecliptic in roughly 80-day campaigns, focusing on nearby bright stars, young stars, and clusters.",
        "It continued to apply the transit method and revealed hundreds of additional exoplanets."
    ],
    "TESS": [
        "TESS Mission (2018–present): The Transiting Exoplanet Survey Satellite is an all-sky survey designed to find exoplanets around the brightest nearby stars.",
        "Like Kepler, it uses the transit method, but its wide coverage concentrates on stars within a few hundred light-years, making discovered planets easier to follow up.",
        "TESS has already discovered thousands of exoplanet candidates and continues to expand the census of nearby planetary systems."
    ],
}

COLUMN_DEFS = [
    ("pl_name", "Planet"),
    ("hostname", "Host Star"),
    ("disposition", "Disposition"),
    ("PredictionLabel", "Prediction"),
    ("Planet Radius", "Planet Radius"),
    ("Orbital Period", "Orbital Period"),
    ("Stellar Radius", "Stellar Radius"),
    ("pl_masse", "Mass [Earth masses]"),
    ("pl_eqt", "Equilibrium Temp [K]"),
    ("discoverymethod", "Discovery Method"),
    ("disc_year", "Discovery Year"),
]


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def resolve_prediction_status(value):
    try:
        code = int(round(float(value)))
    except (TypeError, ValueError):
        return None, DEFAULT_STATUS
    status = STATUS_CONFIG.get(code)
    if status is None:
        return None, DEFAULT_STATUS
    return code, status


def status_as_series(value):
    code, status = resolve_prediction_status(value)
    return pd.Series(
        {
            "PredictionCode": code,
            "PredictionLabel": status["label"],
            "PredictionClass": status["css_class"],
        }
    )


def get_row_value(row, *keys):
    if isinstance(row, dict):
        row_dict = row
    else:
        row_dict = getattr(row, "_asdict", lambda: {})()
        if not row_dict:
            row_dict = {}
    for key in keys:
        if key in row_dict:
            value = row_dict[key]
            if value is not None:
                return value
        alias = key.replace(" ", "_")
        if alias in row_dict:
            value = row_dict[alias]
            if value is not None:
                return value
    return None


def run_inference(csv_path: Path, model_name: str) -> Path:
    if not SCRIPT_PATH.exists():
        raise FileNotFoundError("Model script scripts/model_selector.py not found")

    model_key = model_name.upper()
    if model_key not in MODEL_CHOICES:
        raise ValueError(f"Unsupported model: {model_name}")

    with TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        command = [sys.executable, str(SCRIPT_PATH), str(csv_path), model_key]
        result = subprocess.run(
            command,
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode != 0:
            raise RuntimeError(
                "Model execution failed",
                {"stdout": result.stdout, "stderr": result.stderr},
            )

        generated_file = tmp_path / "data.csv"
        if not generated_file.exists():
            raise FileNotFoundError("No data.csv produced by the model script")

        mission_slug = secure_filename(model_key.lower()) or "mission"
        source_slug = secure_filename(csv_path.stem) or "dataset"
        suffix = uuid.uuid4().hex[:8]
        output_filename = f"{mission_slug}-mission_{source_slug}_{suffix}.csv"
        output_path = PROCESSED_DIR / output_filename
        shutil.copy(generated_file, output_path)
        return output_path


def build_table(df: pd.DataFrame):
    table_columns = [
        {"key": key, "label": label}
        for key, label in COLUMN_DEFS
        if key in df.columns
    ]

    def format_value(value):
        if pd.isna(value):
            return ""
        if isinstance(value, float):
            return f"{value:.3f}".rstrip("0").rstrip(".")
        return str(value)

    records = []
    for row in df.to_dict(orient="records"):
        record = {}
        for column in table_columns:
            key = column["key"]
            value = get_row_value(row, key)
            record[key] = format_value(value)
        prediction_class = get_row_value(row, "PredictionClass")
        prediction_code = get_row_value(row, "PredictionCode")
        if prediction_class is not None:
            record["PredictionClass"] = prediction_class
        if prediction_code is not None:
            record["PredictionCode"] = prediction_code
        records.append(record)

    return table_columns, records


def build_visual_payload(df: pd.DataFrame):
    visual_data = []
    for index, row in enumerate(df.to_dict(orient="records")):
        planet_name = get_row_value(row, "pl_name")
        host_name = get_row_value(row, "hostname")
        radius = get_row_value(row, "Planet Radius", "pl_rade", "koi_prad")
        prediction_code = get_row_value(row, "PredictionCode")
        prediction_label = get_row_value(row, "PredictionLabel")
        prediction_class = get_row_value(row, "PredictionClass")

        label = str(planet_name) if planet_name not in (None, "") else f"Planet {index + 1}"

        def _to_float(value):
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        def _to_int(value):
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        status_label = (
            str(prediction_label) if prediction_label not in (None, "") else DEFAULT_STATUS["label"]
        )
        status_class = (
            str(prediction_class) if prediction_class not in (None, "") else DEFAULT_STATUS["css_class"]
        )

        visual_data.append(
            {
                "index": index,
                "name": label,
                "host": str(host_name) if host_name not in (None, "") else None,
                "radius": _to_float(radius),
                "prediction_code": _to_int(prediction_code),
                "prediction_label": status_label,
                "prediction_class": status_class,
            }
        )
    return visual_data


@app.route("/", methods=["GET", "POST"])
def index():
    context = {
        "planets": None,
        "visual_payload": "[]",
        "table_columns": [],
        "truncated": False,
        "processed_file": None,
        "max_rows": MAX_ROWS,
        "models": MODEL_CHOICES,
        "selected_model": MODEL_CHOICES[0],
        "mission_description": MISSION_DESCRIPTIONS.get(MODEL_CHOICES[0], []),
    }

    if request.method == "POST":
        uploaded_file = request.files.get("data_file")
        if uploaded_file is None or uploaded_file.filename == "":
            flash("Please choose a CSV file.")
            return redirect(url_for("index"))

        if not allowed_file(uploaded_file.filename):
            flash("Only CSV files are supported.")
            return redirect(url_for("index"))

        selected_model = (request.form.get("model_name") or MODEL_CHOICES[0]).upper()
        context["selected_model"] = selected_model
        context["mission_description"] = MISSION_DESCRIPTIONS.get(selected_model, [])
        if selected_model not in MODEL_CHOICES:
            flash("Invalid model selected.")
            return render_template("index.html", **context)

        sanitized_name = secure_filename(uploaded_file.filename)
        unique_name = (
            f"{uuid.uuid4().hex}_{sanitized_name}" if sanitized_name else f"{uuid.uuid4().hex}.csv"
        )
        saved_path = UPLOAD_DIR / unique_name
        uploaded_file.save(saved_path)

        try:
            processed_path = run_inference(saved_path, selected_model)
            dataframe = pd.read_csv(processed_path)
        except Exception as exc:  # noqa: BLE001 - surface error to user
            flash(f"Error processing the file: {exc}")
            return render_template("index.html", **context)

        truncated = len(dataframe) > MAX_ROWS
        display_df = dataframe.head(MAX_ROWS).copy()

        dedupe_keys = [col for col in ("pl_name", "hostname", "k2_name") if col in display_df.columns]
        if dedupe_keys:
            display_df = display_df.drop_duplicates(subset=dedupe_keys, keep="first").copy()

        if "Prediction" in display_df.columns:
            status_df = display_df["Prediction"].apply(status_as_series)
            display_df = pd.concat([display_df, status_df], axis=1)
        else:
            display_df["PredictionCode"] = None
            display_df["PredictionLabel"] = DEFAULT_STATUS["label"]
            display_df["PredictionClass"] = DEFAULT_STATUS["css_class"]

        table_columns, table_data = build_table(display_df)
        visual_payload = build_visual_payload(display_df)

        context.update(
            {
                "planets": table_data,
                "table_columns": table_columns,
                "truncated": truncated,
                "processed_file": processed_path.name,
                "visual_payload": json.dumps(visual_payload, ensure_ascii=False),
                "mission_description": MISSION_DESCRIPTIONS.get(selected_model, []),
            }
        )

    return render_template("index.html", **context)


@app.route("/processed/<path:filename>")
def download_processed(filename: str):
    return send_from_directory(PROCESSED_DIR, filename, as_attachment=True)


if __name__ == "__main__":
    app.run(debug=True)
