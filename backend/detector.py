"""
Deadlock Detection via Resource Allocation Graph (RAG)
-------------------------------------------------------
Builds a directed graph from resource allocation/request data.

Node types:
  - Process nodes: P0, P1, ...
  - Resource nodes: R0, R1, ...

Edge types:
  - Assignment edge: Resource → Process  (resource assigned to process)
  - Request edge:    Process → Resource  (process waiting for resource)

PRIMARY detection uses the reduction algorithm (work-finish simulation),
which is correct for BOTH single-instance and multi-instance resources.

The DFS cycle detection on the RAG is kept for graph VISUALIZATION only,
as a RAG cycle is only a sufficient condition for deadlock when each
resource has exactly one instance.
"""

import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)


def build_rag(
    num_processes: int,
    num_resources: int,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> Tuple[List[dict], List[dict]]:
    """
    Build RAG nodes and edges from current system state for visualization.

    A request edge exists when a process needs a resource AND that resource
    has no free instances AND at least one other process holds an instance
    of it — meaning the process is genuinely blocked waiting.

    Returns:
        (nodes, edges) — lists of dicts for frontend rendering
    """
    nodes = []
    edges = []

    # Process nodes
    for i in range(num_processes):
        nodes.append({"id": f"P{i}", "type": "process", "index": i})

    # Resource nodes
    for j in range(num_resources):
        total_allocated = sum(allocation[i][j] for i in range(num_processes))
        nodes.append({
            "id": f"R{j}",
            "type": "resource",
            "index": j,
            "instances": available[j] + total_allocated,
            "available": available[j],
        })

    # Assignment edges: Resource → Process
    for i in range(num_processes):
        for j in range(num_resources):
            if allocation[i][j] > 0:
                edges.append({
                    "source": f"R{j}",
                    "target": f"P{i}",
                    "type": "assignment",
                    "count": allocation[i][j],
                })

    # Request edges: Process → Resource
    # A process is truly waiting when it needs a resource, none are free,
    # and another process currently holds at least one instance.
    for i in range(num_processes):
        for j in range(num_resources):
            if need[i][j] > 0 and available[j] < need[i][j]:
                other_holds = any(
                    allocation[k][j] > 0 for k in range(num_processes) if k != i
                )
                if other_holds:
                    edges.append({
                        "source": f"P{i}",
                        "target": f"R{j}",
                        "type": "request",
                        "count": need[i][j],
                    })

    return nodes, edges


def detect_deadlock(
    num_processes: int,
    num_resources: int,
    available: List[int],
    allocation: List[List[int]],
    need: List[List[int]],
) -> Tuple[bool, List[int]]:
    """
    PRIMARY Deadlock Detection — Work-Finish Reduction Algorithm.

    Correct for both single-instance and multi-instance resources.

    Algorithm:
    1. work = available
    2. Mark any process with zero allocation as already finished.
    3. Repeatedly find an unfinished process whose need <= work,
       simulate its completion (add its allocation back to work),
       and mark it finished.
    4. Any process still unfinished at the end is deadlocked.

    Returns:
        (has_deadlock, deadlocked_process_indices)
    """
    work = list(available)
    finish = [False] * num_processes

    # Processes holding no resources cannot be part of a deadlock
    for i in range(num_processes):
        if all(allocation[i][j] == 0 for j in range(num_resources)):
            finish[i] = True

    changed = True
    while changed:
        changed = False
        for i in range(num_processes):
            if not finish[i]:
                if all(need[i][j] <= work[j] for j in range(num_resources)):
                    for j in range(num_resources):
                        work[j] += allocation[i][j]
                    finish[i] = True
                    changed = True

    deadlocked = [i for i in range(num_processes) if not finish[i]]

    if deadlocked:
        logger.warning("Deadlock detected. Deadlocked processes: %s", deadlocked)
    else:
        logger.info("No deadlock detected.")

    return len(deadlocked) > 0, deadlocked


def _detect_cycles_for_visualization(
    num_processes: int,
    num_resources: int,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
    deadlocked_set: set,
) -> List[dict]:
    """
    Iterative DFS cycle detection on the RAG — for visualization only.

    Marks graph nodes that are part of a cycle so the frontend can
    highlight them. Uses an explicit stack to avoid Python's recursion
    limit on large graphs.

    Returns the annotated list of graph nodes.
    """
    nodes, edges = build_rag(num_processes, num_resources, allocation, need, available)

    adj = {n["id"]: [] for n in nodes}
    for e in edges:
        adj[e["source"]].append((e["target"], e["type"]))

    visited = set()
    cycle_nodes = set()

    for start_node in [n["id"] for n in nodes]:
        if start_node in visited:
            continue

        # Iterative DFS with explicit stack
        # Stack entries: (node_id, iterator_over_neighbors, path_so_far)
        stack = []
        path = []
        path_set = set()

        stack.append((start_node, iter(adj.get(start_node, []))))
        path.append(start_node)
        path_set.add(start_node)
        visited.add(start_node)

        while stack:
            node, neighbors = stack[-1]
            try:
                (neighbor, edge_type) = next(neighbors)
                if neighbor in path_set:
                    # Cycle found — collect nodes in the cycle
                    idx = path.index(neighbor)
                    cycle = path[idx:]
                    # Validate: every process in the cycle must have a request edge
                    is_true_deadlock = True
                    for k in range(len(cycle)):
                        curr = cycle[k]
                        if curr.startswith("P"):
                            nxt = cycle[(k + 1) % len(cycle)]
                            has_request = any(
                                t == nxt and et == "request"
                                for t, et in adj.get(curr, [])
                            )
                            if not has_request:
                                is_true_deadlock = False
                                logger.debug(
                                    "Cycle skipped (no request edge from %s to %s)", curr, nxt
                                )
                                break
                    if is_true_deadlock:
                        for n_id in cycle:
                            cycle_nodes.add(n_id)
                elif neighbor not in visited:
                    visited.add(neighbor)
                    path.append(neighbor)
                    path_set.add(neighbor)
                    stack.append((neighbor, iter(adj.get(neighbor, []))))
            except StopIteration:
                stack.pop()
                if path:
                    gone = path.pop()
                    path_set.discard(gone)

    # Annotate nodes: deadlocked (confirmed by reduction) takes priority,
    # cycle membership is secondary visual info.
    for node in nodes:
        nid = node["id"]
        node["deadlocked"] = nid in deadlocked_set
        node["in_cycle"] = nid in cycle_nodes

    return nodes
