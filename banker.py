"""
Banker's Algorithm Implementation
----------------------------------
Determines if a system state is safe by finding a safe execution sequence.
A state is safe if there exists an ordering of processes such that each
process can complete given the available resources at that point.
"""

from typing import List, Tuple, Optional


def compute_need_matrix(
    max_demand: List[List[int]], allocation: List[List[int]]
) -> List[List[int]]:
    """
    Compute the Need matrix: Need[i][j] = Max[i][j] - Allocation[i][j]
    """
    n = len(max_demand)
    m = len(max_demand[0]) if n > 0 else 0
    need = []
    for i in range(n):
        row = []
        for j in range(m):
            row.append(max_demand[i][j] - allocation[i][j])
        need.append(row)
    return need


def is_safe_state(
    num_processes: int,
    num_resources: int,
    available: List[int],
    max_demand: List[List[int]],
    allocation: List[List[int]],
) -> Tuple[bool, List[int], List[dict]]:
    """
    Banker's Safety Algorithm.

    Returns:
        (is_safe, safe_sequence, work_steps)
        - is_safe: True if system is in safe state
        - safe_sequence: Order of process execution
        - work_steps: Detailed step-by-step trace for display
    """
    need = compute_need_matrix(max_demand, allocation)
    work = list(available)
    finish = [False] * num_processes
    safe_sequence = []
    work_steps = []

    step = 0
    while len(safe_sequence) < num_processes:
        found = False
        for i in range(num_processes):
            if not finish[i]:
                # Check if process i's need can be satisfied
                can_allocate = all(need[i][j] <= work[j] for j in range(num_resources))
                if can_allocate:
                    # Simulate process completion — release its resources
                    old_work = list(work)
                    for j in range(num_resources):
                        work[j] += allocation[i][j]
                    finish[i] = True
                    safe_sequence.append(i)
                    found = True
                    step += 1
                    work_steps.append({
                        "step": step,
                        "process": i,
                        "need": list(need[i]),
                        "work_before": old_work,
                        "work_after": list(work),
                        "allocation_released": list(allocation[i]),
                    })
                    break

        if not found:
            # No process could proceed — unsafe state
            deadlocked = [i for i in range(num_processes) if not finish[i]]
            return False, safe_sequence, work_steps

    return True, safe_sequence, work_steps


def can_grant_request(
    process_id: int,
    request: List[int],
    num_processes: int,
    num_resources: int,
    available: List[int],
    max_demand: List[List[int]],
    allocation: List[List[int]],
) -> Tuple[bool, str, Optional[List[int]], Optional[List[List[int]]]]:
    """
    Resource Request Algorithm (Banker's).

    Simulates granting the request and checks if resulting state is safe.
    Returns:
        (can_grant, message, new_available, new_allocation)
    """
    need = compute_need_matrix(max_demand, allocation)

    # Step 1: Check request <= need
    if any(request[j] > need[process_id][j] for j in range(num_resources)):
        return False, "Request exceeds maximum demand declared by process.", None, None

    # Step 2: Check request <= available
    if any(request[j] > available[j] for j in range(num_resources)):
        return False, "Resources not available. Process must wait.", None, None

    # Step 3: Pretend to allocate and test safety
    new_available = [available[j] - request[j] for j in range(num_resources)]
    new_allocation = [list(row) for row in allocation]
    for j in range(num_resources):
        new_allocation[process_id][j] += request[j]

    is_safe, _, _ = is_safe_state(
        num_processes, num_resources, new_available, max_demand, new_allocation
    )

    if is_safe:
        return True, "Request granted. System remains in safe state.", new_available, new_allocation
    else:
        return False, "Request denied. Granting would lead to unsafe state.", None, None
