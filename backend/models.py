from pydantic import BaseModel, model_validator
from typing import List, Optional


class InitRequest(BaseModel):
    num_processes: int
    num_resources: int
    available: List[int]
    max_demand: List[List[int]]
    allocation: List[List[int]]
    process_names: Optional[List[str]] = None
    resource_names: Optional[List[str]] = None

    @model_validator(mode='after')
    def validate_matrices(self) -> 'InitRequest':
        n = self.num_processes
        m = self.num_resources

        # FIX: Pydantic validators must raise ValueError, not HTTPException.
        # FastAPI automatically converts ValueError from validators into a
        # clean 422 Unprocessable Entity response with a proper error body.

        if n <= 0 or m <= 0:
            raise ValueError("Number of processes and resources must be positive.")

        if len(self.available) != m:
            raise ValueError(f"available must have {m} elements, got {len(self.available)}.")

        if any(v < 0 for v in self.available):
            raise ValueError("available contains negative values.")

        if len(self.max_demand) != n or any(len(row) != m for row in self.max_demand):
            raise ValueError(f"max_demand must be a {n}x{m} matrix.")

        if len(self.allocation) != n or any(len(row) != m for row in self.allocation):
            raise ValueError(f"allocation must be a {n}x{m} matrix.")

        for i in range(n):
            for j in range(m):
                if self.max_demand[i][j] < 0:
                    raise ValueError(f"max_demand[{i}][{j}] is negative.")
                if self.allocation[i][j] < 0:
                    raise ValueError(f"allocation[{i}][{j}] is negative.")
                if self.allocation[i][j] > self.max_demand[i][j]:
                    raise ValueError(
                        f"allocation[{i}][{j}]={self.allocation[i][j]} exceeds "
                        f"max_demand[{i}][{j}]={self.max_demand[i][j]}."
                    )

        if self.process_names is not None and len(self.process_names) != n:
            raise ValueError(f"process_names must have {n} entries.")

        if self.resource_names is not None and len(self.resource_names) != m:
            raise ValueError(f"resource_names must have {m} entries.")

        return self


class ResourceRequest(BaseModel):
    process_id: int
    request: List[int]

    @model_validator(mode='after')
    def validate_request(self) -> 'ResourceRequest':
        # FIX: raise ValueError, not HTTPException
        if self.process_id < 0:
            raise ValueError("process_id cannot be negative.")
        if any(v < 0 for v in self.request):
            raise ValueError("request contains negative values.")
        return self


class SystemState(BaseModel):
    num_processes: int
    num_resources: int
    available: List[int]
    max_demand: List[List[int]]
    allocation: List[List[int]]
    need: List[List[int]]
    process_names: List[str]
    resource_names: List[str]
    # Tracks which process indices have been terminated during recovery.
    # Terminated processes have their allocation zeroed but remain in the
    # matrix so index positions stay stable for the frontend.
    terminated_processes: List[int] = []


class SafetyResult(BaseModel):
    is_safe: bool
    safe_sequence: List[int]
    message: str
    work_steps: List[dict]


class DeadlockResult(BaseModel):
    has_deadlock: bool
    deadlocked_processes: List[int]
    deadlocked_process_names: List[str]
    graph_nodes: List[dict]
    graph_edges: List[dict]
    message: str


class RecoveryResult(BaseModel):
    recovered: bool
    terminated_processes: List[int]
    terminated_process_names: List[str]
    steps: List[str]
    new_state: Optional[SystemState]
    final_check: Optional[SafetyResult]


class RequestResult(BaseModel):
    granted: bool
    message: str
    new_state: Optional[SystemState]


class AssignResult(BaseModel):
    assigned: bool
    message: str
    new_state: Optional[SystemState]
