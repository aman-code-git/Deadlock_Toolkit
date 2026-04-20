"""
FastAPI Main Application — Deadlock Prevention & Recovery Toolkit
"""

import logging
import threading
import uuid
import copy
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware

from models import (
    InitRequest, ResourceRequest, SystemState,
    SafetyResult, DeadlockResult, RecoveryResult, RequestResult, AssignResult
)
from banker import compute_need_matrix, is_safe_state, can_grant_request
from detector import detect_deadlock, build_rag, _detect_cycles_for_visualization
from recovery import recover_by_termination

# ──────────────────────────────────────────────
# Logging setup
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Deadlock Prevention & Recovery Toolkit",
    description="Real-time deadlock detection, prevention and recovery using Banker's Algorithm",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# In-memory session state
#
# FIX: Each session entry is protected by its own threading.Lock so that
# concurrent requests for the same session cannot corrupt state during
# read-modify-write operations (request granting, recovery, etc.).
#
# Structure:
#   states[session_id] = {
#       "lock": threading.Lock(),
#       "data": { ... system state dict ... }
#   }
# ──────────────────────────────────────────────
states: dict[str, dict] = {}
_states_lock = threading.Lock()  # protects creation/deletion of session entries


def _get_or_create_session(session_id: str) -> dict:
    """Return the session entry, creating it if needed."""
    with _states_lock:
        if session_id not in states:
            states[session_id] = {"lock": threading.Lock(), "data": None}
        return states[session_id]


def get_session_id(request: Request, response: Response) -> str:
    session_id = request.cookies.get("session_id")
    if not session_id:
        session_id = str(uuid.uuid4())
        response.set_cookie(
            key="session_id", value=session_id, httponly=True, samesite="lax"
        )
    return session_id


def _get_state_or_error(session_id: str) -> dict:
    """Return the raw state dict or raise 400 if not initialized."""
    entry = states.get(session_id)
    if not entry or not entry["data"]:
        raise HTTPException(
            status_code=400,
            detail="System not initialized. Call /api/init first."
        )
    return entry["data"]


def _build_system_state_response(state: dict) -> SystemState:
    """Build a SystemState response model from the internal state dict."""
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
        terminated_processes=state.get("terminated_processes", []),
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
        k: {
            "description": v["description"],
            "num_processes": v["num_processes"],
            "num_resources": v["num_resources"],
        }
        for k, v in PRESETS.items()
    }


@app.post("/api/init", response_model=SystemState)
def initialize_system(
    req: InitRequest, session_id: str = Depends(get_session_id)
) -> SystemState:
    """Initialize or reinitialize the system with given parameters."""
    n, m = req.num_processes, req.num_resources
    entry = _get_or_create_session(session_id)

    with entry["lock"]:
        entry["data"] = {
            "num_processes": n,
            "num_resources": m,
            "available": list(req.available),
            "max_demand": [list(row) for row in req.max_demand],
            "allocation": [list(row) for row in req.allocation],
            "process_names": req.process_names or [f"P{i}" for i in range(n)],
            "resource_names": req.resource_names or [f"R{j}" for j in range(m)],
            "terminated_processes": [],
        }
        logger.info("Session %s initialized: %d processes, %d resources.", session_id, n, m)
        return _build_system_state_response(entry["data"])


@app.post("/api/init/preset/{preset_name}", response_model=SystemState)
def load_preset(
    preset_name: str, session_id: str = Depends(get_session_id)
) -> SystemState:
    """Load a predefined scenario preset."""
    if preset_name not in PRESETS:
        raise HTTPException(
            404,
            f"Preset '{preset_name}' not found. Available: {list(PRESETS.keys())}"
        )

    p = PRESETS[preset_name]
    n, m = p["num_processes"], p["num_resources"]
    entry = _get_or_create_session(session_id)

    with entry["lock"]:
        entry["data"] = {
            "num_processes": n,
            "num_resources": m,
            "available": list(p["available"]),
            "max_demand": [list(row) for row in p["max_demand"]],
            "allocation": [list(row) for row in p["allocation"]],
            "process_names": [f"P{i}" for i in range(n)],
            "resource_names": [f"R{j}" for j in range(m)],
            "terminated_processes": [],
        }
        logger.info("Session %s loaded preset '%s'.", session_id, preset_name)
        return _build_system_state_response(entry["data"])


@app.get("/api/state", response_model=SystemState)
def get_state(session_id: str = Depends(get_session_id)) -> SystemState:
    """Get the current system state."""
    entry = states.get(session_id)
    if not entry or not entry["data"]:
        raise HTTPException(400, "System not initialized. Call /api/init first.")
    with entry["lock"]:
        return _build_system_state_response(entry["data"])


@app.post("/api/check-safety", response_model=SafetyResult)
def check_safety(session_id: str = Depends(get_session_id)) -> SafetyResult:
    """Run Banker's safety algorithm on current state."""
    entry = states.get(session_id)
    if not entry or not entry["data"]:
        raise HTTPException(400, "System not initialized. Call /api/init first.")

    with entry["lock"]:
        state = entry["data"]
        n, m = state["num_processes"], state["num_resources"]
        is_safe, seq, steps = is_safe_state(
            n, m, state["available"], state["max_demand"], state["allocation"]
        )
        names = state["process_names"]
        terminated = set(state.get("terminated_processes", []))

        if is_safe:
            msg = f"System is SAFE. Safe sequence: {' → '.join(names[i] for i in seq)}"
        else:
            stuck = [
                names[i] for i in range(n)
                if i not in seq and i not in terminated
            ]
            msg = f"System is UNSAFE. No safe sequence found. Stuck processes: {stuck}"

        return SafetyResult(is_safe=is_safe, safe_sequence=seq, message=msg, work_steps=steps)


@app.post("/api/detect-deadlock", response_model=DeadlockResult)
def detect_deadlock_endpoint(session_id: str = Depends(get_session_id)) -> DeadlockResult:
    """
    Detect deadlock using the reduction algorithm (correct for multi-instance resources).
    Also returns an annotated RAG for visualization.
    """
    entry = states.get(session_id)
    if not entry or not entry["data"]:
        raise HTTPException(400, "System not initialized. Call /api/init first.")

    with entry["lock"]:
        state = entry["data"]
        n, m = state["num_processes"], state["num_resources"]
        need = compute_need_matrix(state["max_demand"], state["allocation"])

        # FIX: Use the reduction algorithm (detect_deadlock) as the primary
        # detection method — it is correct for multi-instance resources.
        has_dl, deadlocked = detect_deadlock(
            n, m, state["available"], state["allocation"], need
        )

        deadlocked_set = {f"P{i}" for i in deadlocked}

        # Build annotated RAG nodes for visualization (cycle info is supplementary)
        annotated_nodes = _detect_cycles_for_visualization(
            n, m, state["allocation"], need, state["available"], deadlocked_set
        )
        _, edges = build_rag(n, m, state["allocation"], need, state["available"])

        names = state["process_names"]
        msg = (
            f"DEADLOCK DETECTED: Processes {[names[i] for i in deadlocked]} are in deadlock."
            if has_dl
            else "No deadlock detected. All processes can complete."
        )

        return DeadlockResult(
            has_deadlock=has_dl,
            deadlocked_processes=deadlocked,
            deadlocked_process_names=[names[i] for i in deadlocked],
            graph_nodes=annotated_nodes,
            graph_edges=edges,
            message=msg,
        )


@app.post("/api/recover", response_model=RecoveryResult)
def recover_deadlock(session_id: str = Depends(get_session_id)) -> RecoveryResult:
    """Recover from deadlock via process termination."""
    entry = states.get(session_id)
    if not entry or not entry["data"]:
        raise HTTPException(400, "System not initialized. Call /api/init first.")

    with entry["lock"]:
        state = entry["data"]
        n, m = state["num_processes"], state["num_resources"]
        need = compute_need_matrix(state["max_demand"], state["allocation"])
        has_dl, deadlocked = detect_deadlock(
            n, m, state["available"], state["allocation"], need
        )

        if not has_dl:
            raise HTTPException(400, "No deadlock detected. Recovery not needed.")

        recovered, terminated, steps, new_avail, new_alloc = recover_by_termination(
            n, m, state["available"], state["max_demand"], state["allocation"], deadlocked
        )

        # Update state under the same lock
        state["available"] = new_avail
        state["allocation"] = new_alloc

        # FIX: Track terminated processes so safety checks and request handling
        # can skip them, preventing misleading results from zeroed-out rows.
        existing_terminated = set(state.get("terminated_processes", []))
        existing_terminated.update(terminated)
        state["terminated_processes"] = sorted(existing_terminated)

        names = state["process_names"]

        # Post-recovery safety check
        is_safe, seq, work_steps = is_safe_state(
            n, m, new_avail, state["max_demand"], new_alloc
        )
        final_check = SafetyResult(
            is_safe=is_safe,
            safe_sequence=seq,
            message=(
                f"Post-recovery: System is SAFE. Sequence: {' → '.join(names[i] for i in seq)}"
                if is_safe
                else "Post-recovery: System state updated but no safe sequence found."
            ),
            work_steps=work_steps,
        )

        logger.info(
            "Recovery complete for session %s. Terminated: %s. Recovered: %s",
            session_id, terminated, recovered
        )

        return RecoveryResult(
            recovered=recovered,
            terminated_processes=terminated,
            terminated_process_names=[names[i] for i in terminated],
            steps=steps,
            new_state=_build_system_state_response(state),
            final_check=final_check,
        )


@app.post("/api/request", response_model=RequestResult)
def request_resources(
    req: ResourceRequest, session_id: str = Depends(get_session_id)
) -> RequestResult:
    """Process a resource request using Banker's resource-request algorithm."""
    entry = states.get(session_id)
    if not entry or not entry["data"]:
        raise HTTPException(400, "System not initialized. Call /api/init first.")

    with entry["lock"]:
        state = entry["data"]
        n, m = state["num_processes"], state["num_resources"]

        if req.process_id >= n:
            raise HTTPException(400, f"Invalid process_id. Must be 0–{n - 1}.")
        if len(req.request) != m:
            raise HTTPException(400, f"Request vector must have {m} elements.")

        # FIX: Block requests from processes that were terminated during recovery
        terminated = state.get("terminated_processes", [])
        if req.process_id in terminated:
            raise HTTPException(
                400,
                f"Process P{req.process_id} has been terminated and cannot make requests."
            )

        granted, message, new_avail, new_alloc = can_grant_request(
            req.process_id, req.request,
            n, m, state["available"], state["max_demand"], state["allocation"]
        )

        if granted:
            state["available"] = new_avail
            state["allocation"] = new_alloc
            logger.info(
                "Session %s: P%d request %s granted.",
                session_id, req.process_id, req.request
            )
            return RequestResult(
                granted=True,
                message=message,
                new_state=_build_system_state_response(state),
            )

        logger.info(
            "Session %s: P%d request %s denied — %s",
            session_id, req.process_id, req.request, message
        )
        return RequestResult(granted=False, message=message, new_state=None)


@app.post("/api/assign-free-resource", response_model=AssignResult)
def assign_free_resource_endpoint(session_id: str = Depends(get_session_id)) -> AssignResult:
    """
    Looks for a free resource that a deadlocked process is waiting for,
    and assigns one instance of it to that process.
    """
    entry = states.get(session_id)
    if not entry or not entry["data"]:
        raise HTTPException(400, "System not initialized. Call /api/init first.")

    with entry["lock"]:
        state = entry["data"]
        n, m = state["num_processes"], state["num_resources"]
        need = compute_need_matrix(state["max_demand"], state["allocation"])

        has_dl, deadlocked = detect_deadlock(
            n, m, state["available"], state["allocation"], need
        )

        if not has_dl:
            raise HTTPException(400, "No deadlock detected. Cannot assign free resources.")

        # Find a free resource that a deadlocked process needs
        assigned = False
        message = "No free resources could be assigned to any deadlocked process."

        for j in range(m):
            if state["available"][j] > 0:
                # Find a deadlocked process that needs this resource
                for i in deadlocked:
                    if need[i][j] > 0:
                        state["available"][j] -= 1
                        state["allocation"][i][j] += 1
                        assigned = True
                        message = f"Assigned free instance of {state['resource_names'][j]} to {state['process_names'][i]}."
                        logger.info("Session %s: %s", session_id, message)
                        break
            if assigned:
                break

        if assigned:
            return AssignResult(
                assigned=True,
                message=message,
                new_state=_build_system_state_response(state),
            )
        else:
            return AssignResult(assigned=False, message=message, new_state=None)



@app.post("/api/reset")
def reset_system(session_id: str = Depends(get_session_id)):
    """Clear system state for this session."""
    with _states_lock:
        if session_id in states:
            states.pop(session_id)
    logger.info("Session %s reset.", session_id)
    return {"message": "System reset successfully."}


@app.get("/")
def root():
    return {
        "message": "Deadlock Prevention & Recovery Toolkit API",
        "docs": "/docs",
        "version": "1.1.0",
    }
