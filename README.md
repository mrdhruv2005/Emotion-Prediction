---
title: Six Channels — Emotion Prediction
emoji: 🎛️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Six Channels — BiGRU Emotion Prediction

A Bidirectional GRU text classifier served with FastAPI. It reads a sentence
forward and backward and reports how strongly each of six emotions registers:
**sadness · joy · love · anger · fear · surprise**. The strongest channel
becomes the predicted label; the full probability breakdown is returned too.

## API

| Method | Path       | Description                                  |
| ------ | ---------- | -------------------------------------------- |
| GET    | `/`        | Web UI (served from `static/`)               |
| GET    | `/health`  | `{ status, model_loaded }`                   |
| POST   | `/predict` | Body `{ "text": "..." }` → emotion + probs   |
| GET    | `/docs`    | Interactive OpenAPI docs                     |

### Example

```bash
curl -X POST https://<your-space>.hf.space/predict \
  -H "Content-Type: application/json" \
  -d '{"text": "i feel so happy and excited"}'
```

```json
{
  "text": "i feel so happy and excited",
  "predicted_emotion": "joy",
  "confidence": 0.999,
  "all_probabilites": { "sadness": 0.0, "joy": 0.999, "love": 0.0,
                        "anger": 0.0, "fear": 0.0, "surprise": 0.0 }
}
```

## Model

- **Architecture:** Bidirectional GRU, softmax over 6 classes
- **Input:** 50-token window, post-padded
- **Artifacts:** `Artifacts/BiGRU_Model.keras` (Keras 3), `Artifacts/tokenizer.pkl`

## Running locally

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7860
# open http://localhost:7860
```

Or with Docker:

```bash
docker build -t six-channels .
docker run -p 7860:7860 six-channels
```
