from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_body_schema_has_parts() -> None:
    response = client.get("/api/body-schema")
    assert response.status_code == 200
    data = response.json()
    assert data["version"]
    assert len(data["body_parts"]) >= 400


def test_parse_workout_text() -> None:
    response = client.post(
        "/api/parse-workout", json={"text": "Bench Press - 4x8\nBarbell Row - 4x10"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["exercises"]) == 2
    assert data["exercises"][0]["name"] == "Bench Press"


def test_parse_workout_flexible_text() -> None:
    response = client.post(
        "/api/parse-workout",
        json={
            "text": "Workout A: Bench Press - 4x8; Squat - 5x5 then Romanian Deadlift - 4x8"
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["exercises"]) >= 3


def test_infer_exercise_mock() -> None:
    response = client.post("/api/infer-exercise", json={"exercise_name": "Bench Press"})
    assert response.status_code == 200
    data = response.json()
    assert data["exercise_name"] == "Bench Press"
    assert any(item["load_label"] == "high" for item in data["activations"])


def test_analyze_workout() -> None:
    response = client.post("/api/analyze-workout", json={"text": "Bench Press\nSquat"})
    assert response.status_code == 200
    data = response.json()
    assert len(data["exercises"]) == 2
    assert len(data["aggregate_activations"]) > 0
    assert len(data["workout_analysis"]["activations"]) > 0


def test_generate_workout() -> None:
    analysis = client.post(
        "/api/analyze-workout", json={"text": "Bench Press\nSquat"}
    ).json()
    response = client.post(
        "/api/generate-workout",
        json={
            "workouts": [
                {
                    "workout_name": "Workout A",
                    "workout_text": "Bench Press\nSquat",
                    "exercises": analysis["exercises"],
                    "aggregate_group_activations": analysis[
                        "aggregate_group_activations"
                    ],
                }
            ],
            "metric_mode": "load",
            "guidance": "Keep it to 45 minutes.",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"]
    assert "Main Work" in data["text"]
    assert len(data["target_muscle_groups"]) > 0
    assert data["mock_mode"] is True
