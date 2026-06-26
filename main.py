"""
FastAPI Main Application — Deadlock Prevention & Recovery Toolkit
"""

from fastapi import FastAPI, HTTPException, Request, Response, Depends
import uuid
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import copy

from models import (
    InitRequest, ResourceRequest, SystemState,
    SafetyResult, DeadlockResult, RecoveryResult, RequestResult
)
from banker import compute_need_matrix, is_safe_state, can_grant_request
from detector import detect_deadlock, build_rag
from recovery import recover_by_termination

app = FastAPI(
    title="Deadlock Prevention & Recovery Toolkit",
    description="Real-time deadlock detection, prevention and recovery using Banker's Algorithm",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# In-memory system state
# ──────────────────────────────────────────────
states: dict[str, dict] = {}


def get_session_id(request: Request, response: Response) -> str:
    session_id = request.cookies.get("session_id")
    if not session_id:
        session_id = str(uuid.uuid4())
        response.set_cookie(key="session_id", value=session_id, httponly=True, samesite="lax")
    return session_id


def _get_state_or_error(session_id: str):
    if session_id not in states or not states[session_id]:
        raise HTTPException(status_code=400, detail="System not initialized. Call /api/init first.")
    return states[session_id]


def _build_system_state_response(session_id: str) -> SystemState:
    state = states[session_id]
    n = state["num_processes"]
    m = state["num_resources"]
    need = compute_need_matrix(state["max_demand"], state["allocation"])
    return SystemState(
        num_processes=n,
        num_resources=m,
        available=state["available"],
        max_demand=state["max_demand"],
        allocation=state["allocation"],
        need=need,
        process_names=state["process_names"],
        resource_names=state["resource_names"],
    )


# ──────────────────────────────────────────────
# Preset Scenarios
# ──────────────────────────────────────────────
PRESETS = {
    "classic_safe": {
        "num_processes": 5,
        "num_resources": 3,
        "available": [3, 3, 2],
        "max_demand": [
            [7, 5, 3],
            [3, 2, 2],
            [9, 0, 2],
            [2, 2, 2],
            [4, 3, 3],
        ],
        "allocation": [
            [0, 1, 0],
            [2, 0, 0],
            [3, 0, 2],
            [2, 1, 1],
            [0, 0, 2],
        ],
        "description": "Classic Banker's Algorithm example (safe state, sequence: P1→P3→P4→P0→P2)",
    },
    "deadlock": {
        "num_processes": 3,
        "num_resources": 2,
        "available": [0, 0],
        "max_demand": [
            [2, 2],
            [2, 2],
            [2, 1],
        ],
        "allocation": [
            [1, 0],
            [0, 1],
            [1, 1],
        ],
        "description": "Deadlock scenario: all processes waiting for each other's resources",
    },
    "dining_philosophers": {
        "num_processes": 4,
        "num_resources": 4,
        "available": [0, 0, 0, 0],
        "max_demand": [
            [1, 1, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 1, 1],
            [1, 0, 0, 1],
        ],
        "allocation": [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ],
        "description": "Dining Philosophers: circular wait — classic deadlock",
    },
    "unsafe_not_deadlocked": {
        "num_processes": 4,
        "num_resources": 3,
        "available": [1, 1, 0],
        "max_demand": [
            [3, 2, 2],
            [6, 1, 3],
            [3, 1, 4],
            [4, 2, 2],
        ],
        "allocation": [
            [1, 0, 0],
            [2, 1, 1],
            [2, 1, 0],
            [0, 0, 2],
        ],
        "description": "Unsafe state (no safe sequence) but not yet deadlocked",
    },
}


# ──────────────────────────────────────────────
# API Endpoints
# ──────────────────────────────────────────────

@app.get("/api/presets")
def get_presets():
    """Return available scenario presets."""
    return {
        k: {"description": v["description"], "num_processes": v["num_processes"], "num_resources": v["num_resources"]}
        for k, v in PRESETS.items()
    }


@app.post("/api/init", response_model=SystemState)
def initialize_system(req: InitRequest, session_id: str = Depends(get_session_id)):
    """Initialize or reinitialize the system with given parameters."""
    n, m = req.num_processes, req.num_resources

    # Redundant manual validation removed; handled by Pydantic validators in models.py

    states[session_id] = {
        "num_processes": n,
        "num_resources": m,
        "available": list(req.available),
        "max_demand": [list(row) for row in req.max_demand],
        "allocation": [list(row) for row in req.allocation],
        "process_names": req.process_names or [f"P{i}" for i in range(n)],
        "resource_names": req.resource_names or [f"R{j}" for j in range(m)],
    }

    return _build_system_state_response(session_id)


@app.post("/api/init/preset/{preset_name}", response_model=SystemState)
def load_preset(preset_name: str, session_id: str = Depends(get_session_id)):
    """Load a predefined scenario preset."""
    if preset_name not in PRESETS:
        raise HTTPException(404, f"Preset '{preset_name}' not found. Available: {list(PRESETS.keys())}")

    p = PRESETS[preset_name]
    n, m = p["num_processes"], p["num_resources"]
    states[session_id] = {
        "num_processes": n,
        "num_resources": m,
        "available": list(p["available"]),
        "max_demand": [list(row) for row in p["max_demand"]],
        "allocation": [list(row) for row in p["allocation"]],
        "process_names": [f"P{i}" for i in range(n)],
        "resource_names": [f"R{j}" for j in range(m)],
    }
    return _build_system_state_response(session_id)


@app.get("/api/state", response_model=SystemState)
def get_state(session_id: str = Depends(get_session_id)):
    """Get the current system state."""
    _get_state_or_error(session_id)
    return _build_system_state_response(session_id)


@app.post("/api/check-safety", response_model=SafetyResult)
def check_safety(session_id: str = Depends(get_session_id)):
    """Run Banker's safety algorithm on current state."""
    state = _get_state_or_error(session_id)
    n, m = state["num_processes"], state["num_resources"]
    is_safe, seq, steps = is_safe_state(
        n, m, state["available"], state["max_demand"], state["allocation"]
    )
    names = state["process_names"]
    return SafetyResult(
        is_safe=is_safe,
        safe_sequence=seq,
        message=(
            f"System is SAFE. Safe sequence: {' → '.join(names[i] for i in seq)}"
            if is_safe
            else f"System is UNSAFE. No safe sequence found. Processes unable to complete: "
                 f"{[names[i] for i in range(n) if i not in seq]}"
        ),
        work_steps=steps,
    )


@app.post("/api/detect-deadlock", response_model=DeadlockResult)
def detect_deadlock_endpoint(session_id: str = Depends(get_session_id)):
    """Detect deadlock in current state using resource allocation graph analysis."""
    state = _get_state_or_error(session_id)
    n, m = state["num_processes"], state["num_resources"]
    need = compute_need_matrix(state["max_demand"], state["allocation"])
    has_dl, deadlocked = detect_deadlock(n, m, state["available"], state["allocation"], need)
    nodes, edges = build_rag(n, m, state["allocation"], need, state["available"])

    # Mark deadlocked nodes
    deadlocked_set = {f"P{i}" for i in deadlocked}
    for node in nodes:
        node["deadlocked"] = node["id"] in deadlocked_set

    names = state["process_names"]
    return DeadlockResult(
        has_deadlock=has_dl,
        deadlocked_processes=deadlocked,
        deadlocked_process_names=[names[i] for i in deadlocked],
        graph_nodes=nodes,
        graph_edges=edges,
        message=(
            f"DEADLOCK DETECTED: Processes {[names[i] for i in deadlocked]} are in deadlock."
            if has_dl
            else "No deadlock detected. All processes can complete."
        ),
    )


@app.post("/api/recover", response_model=RecoveryResult)
def recover_deadlock(session_id: str = Depends(get_session_id)):
    """Recover from deadlock via process termination."""
    state = _get_state_or_error(session_id)
    n, m = state["num_processes"], state["num_resources"]
    need = compute_need_matrix(state["max_demand"], state["allocation"])
    has_dl, deadlocked = detect_deadlock(n, m, state["available"], state["allocation"], need)

    if not has_dl:
        raise HTTPException(400, "No deadlock detected. Recovery not needed.")

    recovered, terminated, steps, new_avail, new_alloc = recover_by_termination(
        n, m, state["available"], state["max_demand"], state["allocation"], deadlocked
    )

    # Update global state
    state["available"] = new_avail
    state["allocation"] = new_alloc

    names = state["process_names"]

    # Run final safety check
    new_need = compute_need_matrix(state["max_demand"], state["allocation"])
    is_safe, seq, work_steps = is_safe_state(n, m, new_avail, state["max_demand"], new_alloc)

    final_check = SafetyResult(
        is_safe=is_safe,
        safe_sequence=seq,
        message=(
            f"Post-recovery: System is SAFE. Sequence: {' → '.join(names[i] for i in seq)}"
            if is_safe else "Post-recovery: System state updated."
        ),
        work_steps=work_steps,
    )

    return RecoveryResult(
        recovered=recovered,
        terminated_processes=terminated,
        terminated_process_names=[names[i] for i in terminated],
        steps=steps,
        new_state=_build_system_state_response(session_id),
        final_check=final_check,
    )


@app.post("/api/request", response_model=RequestResult)
def request_resources(req: ResourceRequest, session_id: str = Depends(get_session_id)):
    """Process a resource request using Banker's resource-request algorithm."""
    state = _get_state_or_error(session_id)
    n, m = state["num_processes"], state["num_resources"]

    if req.process_id >= n:
        raise HTTPException(400, f"Invalid process_id. Must be 0-{n-1}.")
    if len(req.request) != m:
        raise HTTPException(400, f"Request vector must have {m} elements.")

    granted, message, new_avail, new_alloc = can_grant_request(
        req.process_id, req.request,
        n, m, state["available"], state["max_demand"], state["allocation"]
    )

    if granted:
        state["available"] = new_avail
        state["allocation"] = new_alloc
        return RequestResult(
            granted=True,
            message=message,
            new_state=_build_system_state_response(session_id),
        )
    return RequestResult(granted=False, message=message, new_state=None)


@app.post("/api/reset")
def reset_system(session_id: str = Depends(get_session_id)):
    """Clear system state."""
    if session_id in states:
        states.pop(session_id)
    return {"message": "System reset successfully."}


@app.get("/")
def root():
    return {"message": "Deadlock Prevention & Recovery Toolkit API", "docs": "/docs"}
