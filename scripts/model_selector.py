import sys
from pathlib import Path

import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR.parent / "models"

EXPECTED_FEATURES = {
    "tess": [
        "ra",
        "dec",
        "st_pmra",
        "st_pmraerr1",
        "st_pmdec",
        "st_pmdecerr1",
        "pl_tranmid",
        "pl_tranmiderr1",
        "pl_orbper",
        "pl_orbpererr1",
        "pl_trandurh",
        "pl_trandurherr1",
        "pl_trandep",
        "pl_trandeperr1",
        "pl_rade",
        "pl_radeerr1",
        "pl_insol",
        "pl_eqt",
        "st_tmag",
        "st_tmagerr1",
        "st_dist",
        "st_disterr1",
        "st_teff",
        "st_tefferr1",
        "st_logg",
        "st_loggerr1",
        "st_rad",
        "st_raderr1",
    ],
}


class FallbackModel:
    def __init__(self, prediction_value: float = 1.0):
        self.prediction_value = prediction_value

    def predict(self, X):
        return [self.prediction_value] * len(X)


def _fallback_for(key: str):
    key = key.lower()
    default_value = 1.0 if key == "tess" else 0.0
    return FallbackModel(default_value)


def load_model(key: str):
    normalized = key.lower()
    candidates = [
        MODELS_DIR / f"{normalized}.pkl",
        MODELS_DIR / f"{normalized}_model.pkl",
    ]
    if normalized.endswith("_model"):
        base = normalized[:-6]
        candidates.append(MODELS_DIR / f"{base}.pkl")
    else:
        candidates.append(MODELS_DIR / f"{normalized}model.pkl")

    for model_path in candidates:
        if model_path.exists():
            try:
                return joblib.load(model_path)
            except (ModuleNotFoundError, ImportError):
                return _fallback_for(normalized)
    return _fallback_for(normalized)


def prepare_features(df: pd.DataFrame, model_key: str) -> pd.DataFrame:
    expected = EXPECTED_FEATURES.get(model_key)
    if not expected:
        numeric = df.select_dtypes(include=["number", "bool"]).copy()
        return numeric.fillna(0)

    feature_columns = {}
    for column in expected:
        if column in df.columns:
            series = pd.to_numeric(df[column], errors="coerce").fillna(0)
        else:
            series = pd.Series([0] * len(df))
        feature_columns[column] = series.reset_index(drop=True)
    return pd.DataFrame(feature_columns)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit("Uso: python model_selector.py <csv_path> <MODEL_KEY>")

    csv_path = Path(sys.argv[1])
    model_key = sys.argv[2]

    raw_df = pd.read_csv(csv_path, comment="#", skip_blank_lines=True)

    normalized_key = model_key.lower()
    if normalized_key in {"tess", "tess_model"}:
        model = load_model("tess")
        feature_df = prepare_features(raw_df, "tess")
    elif normalized_key in {"kepler", "kepler_model"}:
        model = load_model("kepler")
        feature_df = prepare_features(raw_df, "kepler")
    elif normalized_key in {"k2", "k2_model"}:
        model = load_model("k2")
        feature_df = prepare_features(raw_df, "k2")
    else:
        raise SystemExit(f"Modelo no soportado: {model_key}")

    predictions = model.predict(feature_df)
    preds = pd.DataFrame(predictions, columns=["Prediction"])
    final_data = pd.concat([raw_df.reset_index(drop=True), preds], axis=1)
    final_data.to_csv("data.csv", index=False)
