import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

const NODE_RADIUS = 26;
const RESOURCE_SIZE = 44;

export default function ResourceGraph({ nodes = [], edges = [], deadlocked = false }) {
  const svgRef = useRef(null);
  const positionsRef = useRef({});

  useEffect(() => {
    if (!nodes.length) return;
    const container = svgRef.current.parentElement;
    const W = container.clientWidth || 700;
    const H = 420;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);

    // ── Arrow markers ────────────────────────────────
    const defs = svg.append('defs');

    const makeMarker = (id, color) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    };

    makeMarker('arrow-assign', '#00E5FF');
    makeMarker('arrow-request', '#D69E2E');
    makeMarker('arrow-deadlock', '#E53E3E');

    // ── Build node/edge data ─────────────────────────
    const prevPos = positionsRef.current;
    const nodeMap = {};
    const simNodes = nodes.map(n => {
      const p = prevPos[n.id];
      const obj = { ...n, x: p ? p.x : W / 2, y: p ? p.y : H / 2, vx: p ? p.vx : 0, vy: p ? p.vy : 0 };
      nodeMap[n.id] = obj;
      return obj;
    });

    const simEdges = edges.map(e => ({
      ...e,
      source: nodeMap[e.source],
      target: nodeMap[e.target],
    }));

    // ── Force simulation ─────────────────────────────
    const sim = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink(simEdges).distance(120).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-380))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(55))
      .alphaDecay(0.03);

    const container_g = svg.append('g');

    // ── Zoom ─────────────────────────────────────────
    svg.call(d3.zoom()
      .scaleExtent([0.4, 2.5])
      .on('zoom', (event) => container_g.attr('transform', event.transform))
    );

    // ── Edges ────────────────────────────────────────
    const link = container_g.append('g').attr('class', 'links')
      .selectAll('path')
      .data(simEdges)
      .enter().append('path')
      .attr('stroke', d => d.type === 'assignment' ? '#00E5FF' : '#D69E2E')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.75)
      .attr('fill', 'none')
      .attr('marker-end', d => d.type === 'assignment' ? 'url(#arrow-assign)' : 'url(#arrow-request)')
      .attr('stroke-dasharray', d => d.type === 'request' ? '6 3' : 'none');

    // Edge count labels
    const linkLabel = container_g.append('g').attr('class', 'link-labels')
      .selectAll('text')
      .data(simEdges)
      .enter().append('text')
      .attr('font-size', '10px')
      .attr('fill', d => d.type === 'assignment' ? '#00E5FF' : '#D69E2E')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(d => d.count > 1 ? `×${d.count}` : '');

    // ── Nodes ────────────────────────────────────────
    const node = container_g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .enter().append('g')
      .attr('cursor', 'grab')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Process nodes — circles
    const processNodes = node.filter(d => d.type === 'process');
    processNodes.append('circle')
      .attr('r', NODE_RADIUS)
      .attr('fill', d => d.deadlocked ? 'rgba(229,62,62,0.2)' : 'rgba(28, 40, 73,0.4)')
      .attr('stroke', d => d.deadlocked ? '#E53E3E' : '#2D4173')
      .attr('stroke-width', d => d.deadlocked ? 2.5 : 1.5)
      .style('filter', d => d.deadlocked ? 'drop-shadow(0 0 8px rgba(229,62,62,0.6))' : 'drop-shadow(0 0 6px rgba(45, 65, 115,0.4))');

    processNodes.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '13px')
      .attr('font-weight', '700')
      .attr('font-family', 'Inter, sans-serif')
      .attr('fill', d => d.deadlocked ? '#fc8181' : '#FFFFFF')
      .text(d => d.id);

    // Resource nodes — rounded rectangles
    const resourceNodes = node.filter(d => d.type === 'resource');
    resourceNodes.append('rect')
      .attr('width', RESOURCE_SIZE + 20)
      .attr('height', RESOURCE_SIZE)
      .attr('x', -(RESOURCE_SIZE + 20) / 2)
      .attr('y', -RESOURCE_SIZE / 2)
      .attr('rx', 8)
      .attr('fill', 'rgba(45, 65, 115,0.15)')
      .attr('stroke', '#2D4173')
      .attr('stroke-width', 1.5)
      .style('filter', 'drop-shadow(0 0 5px rgba(45, 65, 115,0.3))');

    resourceNodes.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '12px')
      .attr('font-weight', '700')
      .attr('font-family', 'Inter, sans-serif')
      .attr('fill', '#00E5FF')
      .text(d => d.id);

    // Instance dots inside resource nodes
    resourceNodes.each(function(d) {
      const g = d3.select(this);
      const total = d.instances || 1;
      const avail = d.available || 0;
      for (let i = 0; i < Math.min(total, 5); i++) {
        g.append('circle')
          .attr('r', 3.5)
          .attr('cx', -((Math.min(total, 5) - 1) * 8) / 2 + i * 8)
          .attr('cy', RESOURCE_SIZE / 2 - 8)
          .attr('fill', i < avail ? '#00E5FF' : '#E53E3E')
          .attr('opacity', 0.8);
      }
    });

    // ── Tick ─────────────────────────────────────────
    const getEdgePath = (d) => {
      const sx = d.source.x, sy = d.source.y;
      const tx = d.target.x, ty = d.target.y;
      const dx = tx - sx, dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Offset source/target to edge of node shape
      const srcR = d.source.type === 'process' ? NODE_RADIUS : (RESOURCE_SIZE + 20) / 2;
      const tgtR = d.target.type === 'process' ? NODE_RADIUS + 4 : (RESOURCE_SIZE + 20) / 2 + 4;
      const x1 = sx + (dx / dist) * srcR;
      const y1 = sy + (dy / dist) * srcR;
      const x2 = tx - (dx / dist) * tgtR;
      const y2 = ty - (dy / dist) * tgtR;

      // Slight curve
      const mx = (x1 + x2) / 2 - (dy / dist) * 20;
      const my = (y1 + y2) / 2 + (dx / dist) * 20;
      return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
    };

    sim.on('tick', () => {
      link.attr('d', getEdgePath);
      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 10);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
      simNodes.forEach(n => {
        prevPos[n.id] = { x: n.x, y: n.y, vx: n.vx, vy: n.vy };
      });
    };
  }, [nodes, edges, deadlocked]);

  if (!nodes.length) {
    return (
      <div style={{
        height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: 'var(--text-dim)',
      }}>
        <span style={{ fontSize: 40 }}>◎</span>
        <p style={{ fontSize: '0.85rem' }}>Initialize the system to view<br/>the Resource Allocation Graph</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 12, flexWrap: 'wrap', fontSize: '0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, height: 2, background: '#00E5FF', display: 'inline-block', borderRadius: 2 }} />
          <span style={{ color: 'var(--text-muted)' }}>Assignment (R→P)</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, height: 2, background: '#D69E2E', display: 'inline-block', borderRadius: 2, borderTop: '2px dashed #D69E2E' }} />
          <span style={{ color: 'var(--text-muted)' }}>Request (P→R)</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(229,62,62,0.3)', border: '2px solid #E53E3E', display: 'inline-block' }} />
          <span style={{ color: 'var(--text-muted)' }}>Deadlocked Process</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 3.5, height: 7, borderRadius: 2, background: '#E53E3E', display: 'inline-block', marginRight: 1 }} />
          <span style={{ width: 3.5, height: 7, borderRadius: 2, background: '#00E5FF', display: 'inline-block' }} />
          <span style={{ color: 'var(--text-muted)' }}>Resource instances (red=held, green=free)</span>
        </span>
        <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>Drag nodes to rearrange · Scroll to zoom</span>
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 420, display: 'block' }} />
    </div>
  );
}
