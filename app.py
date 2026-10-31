import os, json, sqlite3, joblib
from datetime import date
from functools import wraps
from flask import Flask, request, jsonify, session, render_template, g
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "spendwise.db")
CATS = ["Food", "Travel", "Shopping", "Education", "Entertainment", "Bills & Utilities"]
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-for-real-use")

try:
    model = joblib.load(os.path.join(BASE, "models", "expense_model.pkl"))
    vec = joblib.load(os.path.join(BASE, "models", "tfidf_vectorizer.pkl"))
except FileNotFoundError:
    raise SystemExit("Model files missing. Run: python generate_dataset.py && python train_model.py")

def init_db():
    c = sqlite3.connect(DB)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, budget REAL DEFAULT 0, created TEXT);
    CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        description TEXT NOT NULL, amount REAL NOT NULL, category TEXT NOT NULL,
        predicted_category TEXT, confidence REAL, date TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id));""")
    cols = [r[1] for r in c.execute("PRAGMA table_info(users)")]
    if "budget" not in cols: c.execute("ALTER TABLE users ADD COLUMN budget REAL DEFAULT 0")
    if "created" not in cols: c.execute("ALTER TABLE users ADD COLUMN created TEXT")
    c.commit(); c.close()
init_db()

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB); g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d: d.close()

def user_json(uid):
    u = db().execute("SELECT name,email,budget,created FROM users WHERE id=?", (uid,)).fetchone()
    return dict(name=u["name"], email=u["email"], budget=u["budget"] or 0, created=u["created"])

def err(msg, code=400): return jsonify(error=msg), code

def login_required(f):
    @wraps(f)
    def w(*a, **k):
        if "uid" not in session: return err("Please log in first.", 401)
        return f(*a, **k)
    return w

@app.route("/")
def index(): return render_template("index.html")

# ---------- auth ----------
@app.post("/api/register")
def register():
    d = request.get_json(silent=True) or {}
    name, email, pw = (d.get("name") or "").strip(), (d.get("email") or "").strip().lower(), d.get("password") or ""
    if not name or "@" not in email or "." not in email: return err("Enter your name and a valid email.")
    if len(pw) < 6: return err("Password must be at least 6 characters.")
    if db().execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone(): return err("This email is already registered.", 409)
    cur = db().execute("INSERT INTO users(name,email,password_hash,created) VALUES(?,?,?,?)", (name, email, generate_password_hash(pw), date.today().isoformat()))
    db().commit(); session["uid"] = cur.lastrowid
    return jsonify(user_json(cur.lastrowid)), 201

@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    u = db().execute("SELECT * FROM users WHERE email=?", ((d.get("email") or "").strip().lower(),)).fetchone()
    if not u or not check_password_hash(u["password_hash"], d.get("password") or ""): return err("Wrong email or password.", 401)
    session["uid"] = u["id"]
    return jsonify(user_json(u["id"]))

@app.post("/api/logout")
def logout(): session.clear(); return jsonify(ok=True)

@app.get("/api/me")
@login_required
def me():
    return jsonify(user_json(session["uid"]))

@app.put("/api/profile")
@login_required
def profile():
    d = request.get_json(silent=True) or {}
    name = (d.get("name") or "").strip()
    try: budget = float(d.get("budget") or 0)
    except (TypeError, ValueError): return err("Enter a valid budget.")
    if not name: return err("Name cannot be empty.")
    if not 0 <= budget < 1e9: return err("Budget must be 0 or more.")
    db().execute("UPDATE users SET name=?, budget=? WHERE id=?", (name[:60], round(budget, 2), session["uid"])); db().commit()
    return jsonify(user_json(session["uid"]))

@app.post("/api/password")
@login_required
def password():
    d = request.get_json(silent=True) or {}
    u = db().execute("SELECT password_hash FROM users WHERE id=?", (session["uid"],)).fetchone()
    if not check_password_hash(u["password_hash"], d.get("current") or ""): return err("Current password is wrong.", 403)
    if len(d.get("new") or "") < 6: return err("New password must be at least 6 characters.")
    db().execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(d["new"]), session["uid"])); db().commit()
    return jsonify(ok=True)

@app.delete("/api/account")
@login_required
def delete_account():
    db().execute("DELETE FROM transactions WHERE user_id=?", (session["uid"],))
    db().execute("DELETE FROM users WHERE id=?", (session["uid"],)); db().commit(); session.clear()
    return jsonify(ok=True)

# ---------- ML ----------
@app.post("/api/predict")
@login_required
def predict():
    text = ((request.get_json(silent=True) or {}).get("description") or "").strip()
    if not text: return err("Please enter an expense description.")
    if len(text) > 200: return err("Description is too long (max 200 characters).")
    try:
        X = vec.transform([text.lower()])
        if X.nnz == 0:
            return err("The model does not recognise any words in this description. Try describing the purchase differently.", 422)
        p = model.predict_proba(X)[0]; i = int(p.argmax())
        contrib = X.toarray()[0] * (model.feature_log_prob_[i] - model.feature_log_prob_.mean(axis=0))
        names = vec.get_feature_names_out()
        keys = [names[j][6:] for j in contrib.argsort()[::-1] if contrib[j] > 0 and names[j].startswith('word__')][:3]
        top = sorted(zip(model.classes_, p), key=lambda x: -x[1])[:3]
        return jsonify(status="success", category=str(model.classes_[i]), confidence=round(float(p[i]), 4),
                       keywords=keys, top=[{"category": str(c), "probability": round(float(v), 4)} for c, v in top])
    except Exception:
        return err("Prediction failed. Please try again.", 500)

@app.get("/api/model-info")
@login_required
def model_info():
    with open(os.path.join(BASE, "evaluation", "model_metrics.json")) as f: return jsonify(json.load(f))

# ---------- transactions ----------
def clean(d):
    desc = (d.get("description") or "").strip()
    if not desc: return None, "Description is required."
    try: amt = float(d.get("amount"))
    except (TypeError, ValueError): return None, "Enter a valid amount."
    if not 0 < amt < 1e9: return None, "Amount must be greater than 0."
    if d.get("category") not in CATS: return None, "Choose one of the six categories."
    try: dt = date.fromisoformat(d.get("date") or date.today().isoformat()).isoformat()
    except ValueError: return None, "Enter a valid date."
    return dict(description=desc[:200], amount=round(amt, 2), category=d["category"], date=dt), None

@app.get("/api/transactions")
@login_required
def list_tx():
    rows = db().execute("SELECT * FROM transactions WHERE user_id=? ORDER BY date DESC, id DESC", (session["uid"],)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.post("/api/transactions")
@login_required
def add_tx():
    d = request.get_json(silent=True) or {}
    v, e = clean(d)
    if e: return err(e)
    pc = d.get("predicted_category") if d.get("predicted_category") in CATS else None
    conf = d.get("confidence") if isinstance(d.get("confidence"), (int, float)) else None
    cur = db().execute("INSERT INTO transactions(user_id,description,amount,category,predicted_category,confidence,date) VALUES(?,?,?,?,?,?,?)",
                       (session["uid"], v["description"], v["amount"], v["category"], pc, conf, v["date"]))
    db().commit()
    return jsonify(dict(db().execute("SELECT * FROM transactions WHERE id=?", (cur.lastrowid,)).fetchone())), 201

@app.put("/api/transactions/<int:tid>")
@login_required
def edit_tx(tid):
    v, e = clean(request.get_json(silent=True) or {})
    if e: return err(e)
    cur = db().execute("UPDATE transactions SET description=?,amount=?,category=?,date=? WHERE id=? AND user_id=?",
                       (v["description"], v["amount"], v["category"], v["date"], tid, session["uid"]))
    db().commit()
    if not cur.rowcount: return err("Transaction not found.", 404)
    return jsonify(dict(db().execute("SELECT * FROM transactions WHERE id=?", (tid,)).fetchone()))

@app.delete("/api/transactions/<int:tid>")
@login_required
def del_tx(tid):
    cur = db().execute("DELETE FROM transactions WHERE id=? AND user_id=?", (tid, session["uid"])); db().commit()
    return (jsonify(ok=True) if cur.rowcount else err("Transaction not found.", 404))

if __name__ == "__main__":
    app.run(debug=True)
