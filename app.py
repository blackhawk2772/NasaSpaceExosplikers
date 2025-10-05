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

COLUMN_DEFS = [
    ("pl_name", "Planet"),
    ("hostname", "Host Star"),
    ("disposition", "Disposition"),
    ("PredictionLabel", "Prediction"),
    ("pl_orbper", "Orbital Period [days]"),
    ("pl_rade", "Radius [Earth radii]"),
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

        output_path = PROCESSED_DIR / f"{uuid.uuid4().hex}_{csv_path.stem}_processed.csv"
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
    for row in df.itertuples(index=False):
        record = {}
        for column in table_columns:
            key = column["key"]
            value = getattr(row, key, None)
            record[key] = format_value(value)
        if hasattr(row, "PredictionClass"):
            record["PredictionClass"] = getattr(row, "PredictionClass")
        if hasattr(row, "PredictionCode"):
            record["PredictionCode"] = getattr(row, "PredictionCode")
        records.append(record)

    return table_columns, records


def build_visual_payload(df: pd.DataFrame):
    visual_data = []
    for index, row in enumerate(df.itertuples(index=False)):
        planet_name = getattr(row, "pl_name", None)
        host_name = getattr(row, "hostname", None)
        radius = getattr(row, "pl_rade", None)
        prediction_code = getattr(row, "PredictionCode", None)
        prediction_label = getattr(row, "PredictionLabel", None)
        prediction_class = getattr(row, "PredictionClass", None)

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
            }
        )

    return render_template("index.html", **context)


@app.route("/processed/<path:filename>")
def download_processed(filename: str):
    return send_from_directory(PROCESSED_DIR, filename, as_attachment=True)


if __name__ == "__main__":
    app.run(debug=True)
