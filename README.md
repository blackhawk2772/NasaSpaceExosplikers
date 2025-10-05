# EXOSPLIKERS - NASA Space Apps Challenge

Welcome to the EXOSPLIKERS repository for the 2025 NASA Space Apps Challenge. Our project combines machine learning pipelines with an interactive web experience to help researchers and enthusiasts explore potential exoplanet candidates coming from three major space missions: **Kepler**, **K2**, and **TESS**.

The core of the solution is an XGBoost-based classifier trained separately for each mission. Users can upload catalog data through a Flask web application; the backend routes the dataset to the appropriate model, generates predictions, and surfaces the results as a rich table and 3D visual preview.

---

## Highlights

- Mission-tailored XGBoost models: each notebook reproduces the full training pipeline and evaluation workflow for a specific mission.
- Unified inference bridge: a reusable Python script normalizes incoming CSVs, applies the correct model, and outputs mission-agnostic columns.
- Interactive web app: upload data, inspect predictions, and compare planetary radii against Earth in real time.
- Extensible design: swap in new models or adjust preprocessing while keeping a consistent user interface.

---

## Repository Structure

```
project-root/
|-- app.py                     # Flask entry point and routing logic
|-- requirements.txt           # Python dependencies
|-- Models_Training/
|   |-- Model_Kepler.ipynb     # XGBoost training notebook for Kepler mission
|   |-- Model_K2.ipynb         # XGBoost training notebook for K2 mission
|   `-- Model_TESS.ipynb       # XGBoost training notebook for TESS mission
|-- scripts/
|   `-- model_selector.py      # Inference bridge; loads models and standardizes outputs
|-- models/
|   |-- kepler_model.pkl       # Serialized Kepler classifier
|   |-- k2_model.pkl           # Serialized K2 classifier
|   `-- tess_model.pkl         # Serialized TESS classifier
|-- data/                      # Sample mission datasets (CSV)
|-- processed/                 # Auto-generated prediction exports
|-- static/                    # Front-end assets (CSS, JS, 3D viewer)
|-- templates/                 # Flask HTML templates
`-- uploads/                   # Temporary storage for user-uploaded CSV files
```

---

## Getting Started

### 1. Environment setup

```bash
python -m venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

Note: the notebooks rely on additional scientific Python packages (pandas, numpy, scikit-learn, xgboost, gtda, etc.). Install them manually or export the hackathon environment if you intend to rerun training.

### 2. Launch the web application

```bash
export FLASK_APP=app.py       # On Windows PowerShell: $env:FLASK_APP = "app.py"
flask run --reload
```

Navigate to http://127.0.0.1:5000/, choose a mission, upload a CSV, and review the predictions and visual comparison.

### 3. Running inference scripts manually

You can execute the bridge script outside the UI:

```bash
python scripts/model_selector.py path/to/mission_data.csv TESS
```

A data.csv file containing the predictions and standardized columns (Prediction, Planet Radius, Orbital Period, Stellar Radius, etc.) will be created in the working directory.

---

## Reproducing the Models

Each notebook in Models_Training/ documents the end-to-end pipeline:

1. Data wrangling: cleaning, feature selection, and engineering tailored to the mission catalog.
2. Model training: XGBoost classifier with mission-specific hyperparameters.
3. Evaluation: confusion matrices, performance metrics, and export of the trained model.

To retrain:

1. Open the corresponding notebook.
2. Update file paths if needed (datasets are under data/).
3. Run all cells and export the fitted model (joblib.dump).
4. Replace the .pkl file under models/ to update the production pipeline.

---

## Web Application Flow

1. Upload: the user selects a CSV aligned with the chosen mission's schema.
2. Temporary storage: the file is saved under uploads/ with a unique name.
3. Inference: scripts/model_selector.py loads the mission model, imputes missing values, builds topological descriptors, and writes data.csv.
4. Presentation: app.py normalizes the output, enriches it with prediction labels, and renders the results in templates/index.html.
5. Visualisation: front-end logic in static/js/planet.js scales the featured planet relative to Earth and color-codes results based on classifier output.

---

## Contributing

- Fork the repository and create feature branches (feature/new-visualization, fix/kepler-preprocessing, etc.).
- Document any new dependencies in requirements.txt (or a separate requirements-dev.txt).
- Update this README with relevant instructions when you add new components.

Pull requests are welcome. Please include a short description of the change, manual test results, and any screenshots that help reviewers understand the update.

---

## Team EXOSPLIKERS

We are a multidisciplinary group united by a passion for space exploration, data science, and human-centered design. Thank you for checking out our project. Feel free to reach out with feedback or collaboration ideas!
