"""
Deadlock Recovery Strategies
------------------------------
Implements recovery from deadlocked states by:
  1. Process Termination: Kill processes one by one (lowest cost first)
     until deadlock is resolved.
  2. Resource Preemption: (Future extension)
"""

import copy
import logging
from typing import List, Tuple

from banker import compute_need_matrix, is_safe_state
from detector import detect_deadlock

logger = logging.getLogger(__name__)


def _process_cost(process_id: int, allocation: List[List[int]], need: List[List[int]]) -> float:
    """
    Weighted cost heuristic for choosing which process to terminate.

    Lower cost = terminate first (less destructive to the system).

    Formula: (1.0 * total_held) - (0.5 * total_remaining_need)
      - Higher allocation means more work already done, but also more
        resources freed on termination — slightly preferred to sacrifice.
      - Higher remaining need means the process is far from finishing,
        making it a cheaper sacrifice.
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

    FIX: The termination order is re-evaluated after each termination using
    the updated allocation matrix, so the cost scores are always current.

    FIX: Returns False if recovery somehow fails (all candidates exhausted
    but deadlock still persists — defensive against logic errors).

    Returns:
        (recovered, terminated_list, steps_log, new_available, new_allocation)
    """
    new_available = list(available)
    new_allocation = copy.deepcopy(allocation)
    terminated = []
    steps = []

    # Work from a mutable copy of the candidate list
    remaining_candidates = list(deadlocked_processes)

    while remaining_candidates:
        # FIX: Re-compute need and costs fresh on every iteration,
        # so the ordering reflects the current allocation state.
        current_need = compute_need_matrix(max_demand, new_allocation)
        remaining_candidates.sort(
            key=lambda pid: _process_cost(pid, new_allocation, current_need)
        )

        pid = remaining_candidates.pop(0)

        held_sum = sum(new_allocation[pid])
        need_sum = sum(current_need[pid])
        cost = _process_cost(pid, new_allocation, current_need)

        # Release all resources held by this process
        released = list(new_allocation[pid])
        for j in range(num_resources):
            new_available[j] += new_allocation[pid][j]
            new_allocation[pid][j] = 0

        terminated.append(pid)
        steps.append(
            f"Terminating P{pid} (Cost: {cost:.1f} [Held: {held_sum}, Need: {need_sum}]) — "
            f"released {released}. Available now: {new_available}"
        )
        logger.info("Terminated P%d, released %s, available now %s", pid, released, new_available)

        # Re-check for deadlock with updated state
        updated_need = compute_need_matrix(max_demand, new_allocation)
        has_deadlock, still_deadlocked = detect_deadlock(
            num_processes, num_resources, new_available, new_allocation, updated_need
        )

        if not has_deadlock:
            steps.append("✅ System recovered. No more deadlock detected.")
            logger.info("Recovery successful after terminating: %s", terminated)
            return True, terminated, steps, new_available, new_allocation

        # Narrow the candidate list to only processes still deadlocked
        remaining_candidates = [p for p in still_deadlocked if p not in terminated]
        steps.append(
            f"Deadlock persists. Remaining deadlocked: {[f'P{p}' for p in still_deadlocked]}"
        )

    # FIX: If we exit the loop without resolving deadlock, report failure.
    # This should not happen in practice but guards against edge cases.
    if terminated:
        # Verify one final time — all candidates were terminated
        final_need = compute_need_matrix(max_demand, new_allocation)
        has_deadlock, _ = detect_deadlock(
            num_processes, num_resources, new_available, new_allocation, final_need
        )
        if not has_deadlock:
            steps.append("✅ All deadlocked processes terminated. System cleared.")
            logger.info("Recovery complete (all candidates terminated): %s", terminated)
            return True, terminated, steps, new_available, new_allocation

        steps.append("❌ Recovery failed. Deadlock could not be resolved.")
        logger.error("Recovery failed. Terminated %s but deadlock persists.", terminated)
        return False, terminated, steps, new_available, new_allocation

    steps.append("❌ No candidates available for termination.")
    logger.error("Recovery failed: no deadlocked candidates provided.")
    return False, terminated, steps, new_available, new_allocation
