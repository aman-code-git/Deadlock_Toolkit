from pydantic import BaseModel, model_validator
from typing import List, Optional
from fastapi import HTTPException


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

        if n <= 0 or m <= 0:
            raise HTTPException(status_code=400, detail="Number of processes and resources must be positive.")

        if len(self.available) != m:
            raise HTTPException(status_code=400, detail=f"available must have {m} elements")
        
        if any(v < 0 for v in self.available):
            raise HTTPException(status_code=400, detail="available contains negative values")

        if len(self.max_demand) != n or any(len(row) != m for row in self.max_demand):
            raise HTTPException(status_code=400, detail=f"max_demand must be {n}x{m}")

        if len(self.allocation) != n or any(len(row) != m for row in self.allocation):
            raise HTTPException(status_code=400, detail=f"allocation must be {n}x{m}")

        for i in range(n):
            for j in range(m):
                if self.max_demand[i][j] < 0:
                    raise HTTPException(status_code=400, detail="max_demand contains negative values")
                if self.allocation[i][j] < 0:
                    raise HTTPException(status_code=400, detail="allocation contains negative values")
                if self.allocation[i][j] > self.max_demand[i][j]:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Allocation[{i}][{j}]={self.allocation[i][j]} exceeds MaxDemand[{i}][{j}]={self.max_demand[i][j]}"
                    )

        return self


class ResourceRequest(BaseModel):
    process_id: int
    request: List[int]

    @model_validator(mode='after')
    def validate_request(self) -> 'ResourceRequest':
        if self.process_id < 0:
            raise HTTPException(status_code=400, detail="process_id cannot be negative.")
        if any(v < 0 for v in self.request):
            raise HTTPException(status_code=400, detail="request contains negative values.")
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
