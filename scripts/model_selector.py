import sys
from pathlib import Path

import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR.parent / "models"


class FallbackModel:
    """Simple fallback when a trained model is missing."""

    def __init__(self, prediction_value: float = 1.0):
        self.prediction_value = prediction_value

    def predict(self, X):
        return [self.prediction_value] * len(X)


def load_model(key: str):
    model_path = MODELS_DIR / f"{key.lower()}.pkl"
    if not model_path.exists():
        # fall back to constant predictor if model file is missing
        return FallbackModel(prediction_value=1.0 if key == "TESS" else 0.0)
    return joblib.load(model_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit("Uso: python model_selector.py <csv_path> <MODEL_KEY>")

    csv_path = Path(sys.argv[1])
    model_key = sys.argv[2].upper()

    data = pd.read_csv(csv_path, comment="#", skip_blank_lines=True)

    if model_key == "TESS":
        model = load_model("TESS")
    elif model_key == "KEPLER":
        model = load_model("KEPLER")
    elif model_key == "K2":
        model = load_model("K2")
    else:
        raise SystemExit(f"Modelo no soportado: {model_key}")

    predictions = model.predict(data)
    preds = pd.DataFrame(predictions, columns=["Prediction"])
    final_data = pd.concat([data, preds], axis=1)
    final_data.to_csv("data.csv", index=False)
