import sys
from pathlib import Path
import joblib
import pandas as pd
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR.parent / "models"


class FallbackModel:
    """Simple fallback when a trained model is missing."""

    def __init__(self, prediction_value: float = 1.0):
        self.prediction_value = prediction_value

    def predict(self, X):
        return [self.prediction_value] * len(X)


def load_model(key: str):
    normalized_key = key.upper()
    candidate_paths = [
        MODELS_DIR / f"{normalized_key.lower()}.pkl",
        MODELS_DIR / f"{normalized_key.lower()}_model.pkl",
        MODELS_DIR / f"{normalized_key.lower()}-model.pkl",
    ]
    for model_path in candidate_paths:
        if model_path.exists():
            return joblib.load(model_path)
    # fall back to constant predictor if model file is missing
    return FallbackModel(prediction_value=1.0 if normalized_key == "TESS" else 0.0)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit("Uso: python model_selector.py <csv_path> <MODEL_KEY>")

    csv_path = Path(sys.argv[1])
    model_key = sys.argv[2].upper()

    data = pd.read_csv(csv_path, comment="#", skip_blank_lines=True)

    if model_key == "TESS":
        # Load model
        model = load_model("TESS")
        
        # Process data:
        # Drop Columns HERE
        #drop_cols = ["toi", "tid", "toi_created", "rowupdate", "rastr", "decstr"]
        #data.drop(drop_cols, axis=1, inplace=True)
        # Drop empty rows
        #data.dropna(how="all", inplace=True)
        # Drop columns with too many nans HERE
        #n = len(data)
        #n_nans = np.floor(80*n/100)
        #which_nan = []
        #for col in data.columns.to_list():
        #    n = data[col].isnull().sum().sum()
        #    if n > n_nans:
        #        which_nan.append(col)
        #data.drop(which_nan, axis=1, inplace=True)
        # Drop duplicate rows
        #data.drop_duplicates(inplace=True, keep="first")
        # Drop columns with the same value for every row HERE
        #which_0 = []
        #for col in data.columns:
        #    if data[col].nunique() == 1:
        #        which_0.append(col)
        #data.drop(which_0, axis=1, inplace=True)
        # Drop perfectly correlated error columns HERE
        #problem_cols = []
        #for col in data.columns:
        #    if "err1" in col:
        #        partner_col = col.replace("1", "2")
        #        if partner_col in data.columns.to_list():
        #            problem_cols.append([col, partner_col])
        #for pair in problem_cols:
        #    if (data[pair[0]].dropna() == -data[pair[1]].dropna()).all():
        #        data.drop(pair[1], axis=1, inplace=True)
        
        # Restrict columns
        data = data[['ra', 'dec', 'st_pmra', 'st_pmraerr1', 'st_pmdec',
       'st_pmdecerr1', 'pl_tranmid', 'pl_tranmiderr1', 'pl_orbper',
       'pl_orbpererr1', 'pl_trandurh', 'pl_trandurherr1', 'pl_trandep',
       'pl_trandeperr1', 'pl_rade', 'pl_radeerr1', 'pl_insol', 'pl_eqt',
       'st_tmag', 'st_tmagerr1', 'st_dist', 'st_disterr1', 'st_teff',
       'st_tefferr1', 'st_logg', 'st_loggerr1', 'st_rad', 'st_raderr1']].copy()
        # TDA part
        from sklearn.preprocessing import StandardScaler
        from sklearn.neighbors import NearestNeighbors
        from sklearn.impute import KNNImputer
        from gtda.homology import VietorisRipsPersistence
        from gtda.diagrams import PersistenceEntropy, BettiCurve
        imputer = KNNImputer(n_neighbors=5)  
        X_imputed = imputer.fit_transform(data.values)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_imputed)
        k = 30
        nn = NearestNeighbors(n_neighbors=k, metric="euclidean")
        nn.fit(X_scaled)
        neighborhoods = []
        for i in range(X_scaled.shape[0]):
            distances, indices = nn.kneighbors(X_scaled[i].reshape(1, -1))
            local_cloud = X_scaled[indices[0]]  # (k, n_features)
            neighborhoods.append(local_cloud)
        neighborhoods = np.array(neighborhoods)  # shape (n_samples, k, n_features)
        VR = VietorisRipsPersistence(homology_dimensions=[0, 1], metric="euclidean")
        diagrams = VR.fit_transform(neighborhoods)
        PE = PersistenceEntropy()
        entropy_features = PE.fit_transform(diagrams)
        def total_persistence(diagrams):
            totals = []
            for diag in diagrams:
                row = []
                for dim in [0, 1]:
                    mask = diag[:, 2] == dim
                    lifetimes = diag[mask, 1] - diag[mask, 0]
                    row.append(lifetimes.sum())
                totals.append(row)
            return np.array(totals)
        total_features = total_persistence(diagrams)
        tda_features_combined = np.hstack([entropy_features, total_features])
        tda_feature_names = (
            [f"tda_entropy_dim{i}" for i in range(entropy_features.shape[1])] +
            [f"tda_total_dim{i}" for i in range(total_features.shape[1])]
        )
        tda_df = pd.DataFrame(tda_features_combined, columns=tda_feature_names)
        data = pd.concat([data.reset_index(drop=True), tda_df.reset_index(drop=True)], axis=1)







    
    elif model_key == "KEPLER":
        # Load model
        model = load_model("KEPLER")
        # Process data
    
    elif model_key == "K2":
        # Load model
        model = load_model("K2")
        # Process data
    
    else:
        raise SystemExit(f"Modelo no soportado: {model_key}")
    predictions = model.predict(data)
    preds = pd.DataFrame(predictions, columns=["Prediction"])
    final_data = pd.concat([preds, data], axis=1)
    final_data.to_csv("data.csv", index=False)
