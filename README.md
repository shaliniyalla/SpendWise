# SpendWise – AI Expense Categorizer
Flask + SQLite + scikit-learn (TF-IDF + Multinomial Naive Bayes). Runs fully offline.

## Run
```
python -m venv venv && venv\Scripts\activate      (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python generate_dataset.py     # builds dataset/expenses.csv (1,800 rows)
python train_model.py          # trains model, writes evaluation/model_metrics.json
python app.py                  # open http://127.0.0.1:5000
```
Create an account on first visit. Each user sees only their own transactions.

## Notes for viva
- Metrics are computed on a held-out test set, never typed in by hand.
- Dataset is synthetic/templated, so main accuracy is optimistic; the "strict unseen item" score is the honest one.
- Prediction (POST /api/predict) never saves; saving is a separate action.
- Replace dataset/expenses.csv (columns: description, category, group) with real data and retrain for better results.
