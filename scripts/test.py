import sys
from pathlib import Path

import pandas as pd

if __name__ == "__main__":
    source_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if source_path is None or not source_path.exists():
        raise SystemExit("Input CSV not provided or does not exist")

    data = pd.read_csv(source_path, comment="#", skip_blank_lines=True)
    n = len(data)
    data["Prediction"] = [1] * n
    data["Uncertainty"] = [0.5] * n
    data.to_csv("data.csv", index=False)
