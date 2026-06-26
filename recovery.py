"""
Deadlock Recovery Strategies
------------------------------
Implements recovery from deadlocked states by:
  1. Process Termination: Kill processes one by one (lowest cost first)
     until deadlock is resolved.
  2. Resource Preemption: (Future extension)
"""

from typing import List, Tuple
from banker import compute_need_matrix, is_safe_state
from detector import detect_deadlock
import copy


def _process_cost(process_id: int, allocation: List[List[int]], need: List[List[int]]) -> float:
    """
    Weighted cost heuristic:
    - Higher allocation = higher cost (more work done, but also more to release)
    - Higher need = lower cost (further from finishing, better sacrifice candidate)
    
    Cost = (1.0 * total_held) - (0.5 * total_remaining_need)
    Lower cost = terminate first.
    """
    held = sum(allocation[process_id])
    remaining = sum(need[process_id])
    return (1.0 * held) - (0.5 * remaining)


def recover_by_termination(
    num_processes: int,
    num_resources: int,
    available: List[int],
    max_demand: List[List[int]],
    allocation: List[List[int]],
    deadlocked_processes: List[int],
) -> Tuple[bool, List[int], List[str], List[int], List[List[int]]]:
    """
    Recover from deadlock by terminating deadlocked processes one at a time.
    Terminates the process holding the fewest resources first.

    Returns:
        (recovered, terminated_list, steps_log, new_available, new_allocation)
    """
    new_available = list(available)
    new_allocation = copy.deepcopy(allocation)
    terminated = []
    steps = []

    # Initial need matrix for cost calculation
    need_matrix = compute_need_matrix(max_demand, new_allocation)

    # Sort by ascending cost (lowest weighted cost first)
    # We use a lambda that incorporates current need
    candidates = sorted(
        deadlocked_processes,
        key=lambda pid: _process_cost(pid, new_allocation, need_matrix)
    )

    for pid in candidates:
        # Reasoning log
        held_sum = sum(new_allocation[pid])
        need_sum = sum(need_matrix[pid])
        cost = _process_cost(pid, new_allocation, need_matrix)
        
        # Release all resources held by this process
        released = list(new_allocation[pid])
        for j in range(num_resources):
            new_available[j] += new_allocation[pid][j]
            new_allocation[pid][j] = 0

        terminated.append(pid)
        steps.append(
            f"Terminating P{pid} (Cost: {cost:.1f} [Held: {held_sum}, Need: {need_sum}]) — "
            f"released {released}. Available: {new_available}"
        )

        # Re-check for deadlock
        need = compute_need_matrix(max_demand, new_allocation)
        has_deadlock, remaining = detect_deadlock(
            num_processes, num_resources, new_available, new_allocation, need
        )

        if not has_deadlock:
            steps.append("✅ System recovered. No more deadlock detected.")
            return True, terminated, steps, new_available, new_allocation

        steps.append(f"Deadlock persists. Remaining deadlocked: {[f'P{p}' for p in remaining]}")

    # If we exhausted all deadlocked processes
    steps.append("⚠️ All deadlocked processes terminated. System cleared.")
    return True, terminated, steps, new_available, new_allocation
