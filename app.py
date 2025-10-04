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

COLUMN_DEFS = [
    ("pl_name", "Planet"),
    ("hostname", "Host Star"),
    ("disposition", "Disposition"),
    ("Prediction", "Prediction"),
    ("Uncertainty", "Uncertainty"),
    ("pl_orbper", "Orbital Period [days]"),
    ("pl_rade", "Radius [Earth radii]"),
    ("pl_masse", "Mass [Earth masses]"),
    ("pl_eqt", "Equilibrium Temp [K]"),
    ("discoverymethod", "Discovery Method"),
    ("disc_year", "Discovery Year"),
]


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def run_inference(csv_path: Path, model_name: str) -> Path:
    if not SCRIPT_PATH.exists():
        raise FileNotFoundError("model script scripts/model_selector.py not found")

    model_key = model_name.upper()
    if model_key not in MODEL_CHOICES:
        raise ValueError(f"Modelo no soportado: {model_name}")

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
        records.append(record)

    return table_columns, records


def build_visual_payload(df: pd.DataFrame):
    visual_data = []
    for index, row in enumerate(df.itertuples(index=False)):
        planet_name = getattr(row, "pl_name", None)
        host_name = getattr(row, "hostname", None)
        radius = getattr(row, "pl_rade", None)
        prediction = getattr(row, "Prediction", None)
        uncertainty = getattr(row, "Uncertainty", None)

        label = str(planet_name) if planet_name not in (None, "") else f"Planeta {index + 1}"

        def _to_float(value):
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        visual_data.append(
            {
                "index": index,
                "name": label,
                "host": str(host_name) if host_name not in (None, "") else None,
                "radius": _to_float(radius),
                "prediction": _to_float(prediction),
                "uncertainty": _to_float(uncertainty),
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
            flash("Por favor selecciona un archivo CSV.")
            return redirect(url_for("index"))

        if not allowed_file(uploaded_file.filename):
            flash("El archivo debe ser un CSV.")
            return redirect(url_for("index"))

        selected_model = (request.form.get("model_name") or MODEL_CHOICES[0]).upper()
        context["selected_model"] = selected_model
        if selected_model not in MODEL_CHOICES:
            flash("Modelo seleccionado no válido.")
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
            flash(f"Error procesando el archivo: {exc}")
            return render_template("index.html", **context)

        truncated = len(dataframe) > MAX_ROWS
        display_df = dataframe.head(MAX_ROWS)

        dedupe_keys = [col for col in ("pl_name", "hostname", "k2_name") if col in display_df.columns]
        if dedupe_keys:
            display_df = display_df.drop_duplicates(subset=dedupe_keys, keep="first")

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














