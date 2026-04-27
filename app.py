from flask import Flask, render_template, jsonify
import json
import os

app = Flask(__name__)

DATA_FILE = os.path.join(app.static_folder, "data", "ais_data.geojson")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data")
def api_data():
    if not os.path.exists(DATA_FILE):
        return jsonify({"type": "FeatureCollection", "features": []})
    with open(DATA_FILE) as f:
        return jsonify(json.load(f))

if __name__ == "__main__":
    app.run(debug=True)
