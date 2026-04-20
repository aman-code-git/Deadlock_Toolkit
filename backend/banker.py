"""
Banker's Algorithm Implementation
----------------------------------
Determines if a system state is safe by finding a safe execution sequence.
A state is safe if there exists an ordering of processes such that each
process can complete given the available resources at that point.
"""

import logging
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)


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

    Uses a queue-based approach instead of repeated full scans to find
    candidate processes more efficiently.

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
    # Keep scanning until no more progress can be made
    progress = True
    while progress and len(safe_sequence) < num_processes:
        progress = False
        for i in range(num_processes):
            if not finish[i]:
                can_allocate = all(need[i][j] <= work[j] for j in range(num_resources))
                if can_allocate:
                    old_work = list(work)
                    for j in range(num_resources):
                        work[j] += allocation[i][j]
                    finish[i] = True
                    safe_sequence.append(i)
                    progress = True
                    step += 1
                    work_steps.append({
                        "step": step,
                        "process": i,
                        "need": list(need[i]),
                        "work_before": old_work,
                        "work_after": list(work),
                        "allocation_released": list(allocation[i]),
                    })
                    # Don't break — keep scanning for more processes
                    # that can now proceed with the updated work vector

    is_safe = len(safe_sequence) == num_processes
    if is_safe:
        logger.info("Safety check passed. Safe sequence: %s", safe_sequence)
    else:
        stuck = [i for i in range(num_processes) if not finish[i]]
        logger.warning("Safety check failed. Stuck processes: %s", stuck)

    return is_safe, safe_sequence, work_steps


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
        msg = "Request exceeds maximum demand declared by process."
        logger.warning("P%d request denied: %s", process_id, msg)
        return False, msg, None, None

    # Step 2: Check request <= available
    if any(request[j] > available[j] for j in range(num_resources)):
        msg = "Resources not available. Process must wait."
        logger.warning("P%d request denied: %s", process_id, msg)
        return False, msg, None, None

    # Step 3: Pretend to allocate and test safety
    new_available = [available[j] - request[j] for j in range(num_resources)]
    new_allocation = [list(row) for row in allocation]
    for j in range(num_resources):
        new_allocation[process_id][j] += request[j]

    is_safe, _, _ = is_safe_state(
        num_processes, num_resources, new_available, max_demand, new_allocation
    )

    if is_safe:
        logger.info("P%d request granted. System remains safe.", process_id)
        return True, "Request granted. System remains in safe state.", new_available, new_allocation

    logger.warning("P%d request denied: would lead to unsafe state.", process_id)
    return False, "Request denied. Granting would lead to unsafe state.", None, None
