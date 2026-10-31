"""Trains TF-IDF + Multinomial Naive Bayes. All metrics are computed on held-out test data.
Main split: stratified 80/20. Extra strict check: split by base item so test items are never seen in training."""
import json, joblib, pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion
from sklearn.metrics import accuracy_score, classification_report
df = pd.read_csv("dataset/expenses.csv").dropna().drop_duplicates("description")
df["description"] = df.description.str.lower().str.strip()
def fit(train):
    v = FeatureUnion([('word', TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)),
                      ('char', TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5), sublinear_tf=True))])  # char n-grams help with unseen words and typos
    return v, MultinomialNB(alpha=0.3).fit(v.fit_transform(train.description), train.category)  # vectorizer fit on train only
train, test = train_test_split(df, test_size=0.2, stratify=df.category, random_state=42)
g_tr, g_te = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42).split(df, df.category, df.group))
gv, gm = fit(df.iloc[g_tr])
strict = accuracy_score(df.iloc[g_te].category, gm.predict(gv.transform(df.iloc[g_te].description)))
vec, model = fit(train)
pred = model.predict(vec.transform(test.description))
rep = classification_report(test.category, pred, output_dict=True, zero_division=0)
m = {"algorithm": "Multinomial Naive Bayes", "features": "TF-IDF (word 1-2 grams + character 3-5 grams)",
     "dataset_size": len(df), "train_size": len(train), "test_size": len(test),
     "categories": sorted(df.category.unique().tolist()),
     "accuracy": round(accuracy_score(test.category, pred), 4), "strict_unseen_item_accuracy": round(strict, 4),
     "macro_precision": round(rep["macro avg"]["precision"], 4),
     "macro_recall": round(rep["macro avg"]["recall"], 4),
     "macro_f1": round(rep["macro avg"]["f1-score"], 4),
     "per_category": {c: {k: round(rep[c][k], 4) for k in ("precision", "recall", "f1-score")} | {"support": int(rep[c]["support"])} for c in model.classes_}}
joblib.dump(model, "models/expense_model.pkl"); joblib.dump(vec, "models/tfidf_vectorizer.pkl")
json.dump(m, open("evaluation/model_metrics.json", "w"), indent=2)
print(json.dumps({k: v for k, v in m.items() if k != "per_category"}, indent=2))
