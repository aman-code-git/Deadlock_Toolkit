"""
Deadlock Detection via Resource Allocation Graph (RAG)
-------------------------------------------------------
Builds a directed graph from resource allocation/request data
and uses DFS to detect cycles, which indicate deadlock.

Node types:
  - Process nodes: P0, P1, ...
  - Resource nodes: R0, R1, ...

Edge types:
  - Assignment edge: Resource → Process  (resource assigned to process)
  - Request edge:    Process → Resource  (process waiting for resource)

A cycle in this graph means deadlock.
"""

from typing import List, Tuple, Dict, Set


def build_rag(
    num_processes: int,
    num_resources: int,
    allocation: List[List[int]],
    need: List[List[int]],
    available: List[int],
) -> Tuple[List[dict], List[dict]]:
    """
    Build RAG nodes and edges from current system state.

    A request edge exists when:
      need[i][j] > 0 AND available[j] == 0 AND allocated by some other process
    (process is actually waiting)

    Returns:
        (nodes, edges) — lists of dicts for frontend rendering
    """
    nodes = []
    edges = []

    # Add process nodes
    for i in range(num_processes):
        nodes.append({"id": f"P{i}", "type": "process", "index": i})

    # Add resource nodes
    for j in range(num_resources):
        total_allocated = sum(allocation[i][j] for i in range(num_processes))
        nodes.append({
            "id": f"R{j}",
            "type": "resource",
            "index": j,
            "instances": available[j] + total_allocated,
            "available": available[j],
        })

    # Assignment edges: Resource → Process (this process holds resource)
    for i in range(num_processes):
        for j in range(num_resources):
            if allocation[i][j] > 0:
                edges.append({
                    "source": f"R{j}",
                    "target": f"P{i}",
                    "type": "assignment",
                    "count": allocation[i][j],
                })

    # Request edges: Process → Resource (process is actually waiting for resource)
    # Condition: process needs the resource AND none is available AND
    # at least one other process currently holds an instance of it.
    for i in range(num_processes):
        for j in range(num_resources):
            other_holds = any(
                allocation[k][j] > 0 for k in range(num_processes) if k != i
            )
            if need[i][j] > 0 and available[j] == 0 and other_holds:
                edges.append({
                    "source": f"P{i}",
                    "target": f"R{j}",
                    "type": "request",
                    "count": need[i][j],
                })

    return nodes, edges


def detect_deadlock_reduction(
    num_processes: int,
    num_resources: int,
    available: List[int],
    allocation: List[List[int]],
    need: List[List[int]],
) -> Tuple[bool, List[int]]:
    """
    Deadlock Detection Algorithm (resource-request graph reduction).

    Uses a work-finish simulation:
    - Processes that can complete (need <= work) are marked finished
    - Resources are freed, work vector grows
    - Remaining unfinished processes are deadlocked

    Returns:
        (has_deadlock, deadlocked_process_indices)
    """
    work = list(available)
    finish = [False] * num_processes

    # Mark processes with zero allocation as finished (they hold nothing)
    for i in range(num_processes):
        if all(allocation[i][j] == 0 for j in range(num_resources)):
            finish[i] = True

    changed = True
    while changed:
        changed = False
        for i in range(num_processes):
            if not finish[i]:
                # Can process i complete with current work?
                if all(need[i][j] <= work[j] for j in range(num_resources)):
                    # Simulate completion
                    for j in range(num_resources):
                        work[j] += allocation[i][j]
                    finish[i] = True
                    changed = True

    deadlocked = [i for i in range(num_processes) if not finish[i]]
    return len(deadlocked) > 0, deadlocked


def detect_deadlock(
    num_processes: int,
    num_resources: int,
    available: List[int],
    allocation: List[List[int]],
    need: List[List[int]],
) -> Tuple[bool, List[int]]:
    """
    Deadlock Detection Algorithm (DFS-based cycle detection on RAG).
    
    1. Uses build_rag to create nodes + edges representing the system state.
    2. Converts to adjacency list.
    3. Performs recursive DFS to detect and collect nodes involved in cycles.
    4. Returns processes involved in those cycles.
    
    Returns:
        (has_deadlock, deadlocked_process_indices)
    """
    nodes, edges = build_rag(num_processes, num_resources, allocation, need, available)
    
    # 1. Convert to adjacency list with edge types
    # structure: adj[source_id] = [(target_id, edge_type), ...]
    adj = {n["id"]: [] for n in nodes}
    for e in edges:
        adj[e["source"]].append((e["target"], e["type"]))
        
    # 2. DFS-based cycle detection setup
    visited = set()
    rec_stack = []      # stores (node_id)
    rec_stack_set = set()
    deadlocked_nodes = set()

    def dfs(u: str):
        visited.add(u)
        rec_stack.append(u)
        rec_stack_set.add(u)

        for v, edge_type in adj.get(u, []):
            if v not in visited:
                dfs(v)
            elif v in rec_stack_set:
                # Cycle detected! Root is v.
                # Nodes in the cycle:
                idx = rec_stack.index(v)
                cycle = rec_stack[idx:]
                
                # Validation: Does each process in this cycle have a request edge?
                is_true_deadlock = True
                for i in range(len(cycle)):
                    curr = cycle[i]
                    if curr.startswith("P"):
                        # Check the edge from curr to the next node in the cycle
                        nxt = cycle[(i + 1) % len(cycle)]
                        
                        # Find the edge type between curr and nxt in our adjacency
                        # Since multiple edges could exist between same nodes (unlikely in RAG but possible),
                        # we check if any edge in the cycle path between them is a 'request' edge.
                        has_request = any(
                            target == nxt and etype == "request" 
                            for target, etype in adj.get(curr, [])
                        )
                        if not has_request:
                            is_true_deadlock = False
                            break
                
                if is_true_deadlock:
                    for node in cycle:
                        deadlocked_nodes.add(node)
                    
        rec_stack.pop()
        rec_stack_set.remove(u)

    # 3. Detect cycles from any unvisited node
    for node in nodes:
        node_id = node["id"]
        if node_id not in visited:
            dfs(node_id)
            
    # 4. Filter processes involved in validated cycles
    deadlocked_processes = set()
    for node_id in deadlocked_nodes:
        if node_id.startswith("P"):
            deadlocked_processes.add(int(node_id[1:]))
            
    deadlocked_list = sorted(list(deadlocked_processes))
    
    # 5. Return (has_deadlock, deadlocked_process_indices)
    return len(deadlocked_list) > 0, deadlocked_list
