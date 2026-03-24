'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import './globals.css';

const LEGEND_ITEMS = [
  { type: 'SalesOrder', color: '#FF6B6B', label: 'Sales Order' },
  { type: 'Delivery', color: '#4ECDC4', label: 'Delivery' },
  { type: 'BillingDocument', color: '#45B7D1', label: 'Billing Doc' },
  { type: 'JournalEntry', color: '#96CEB4', label: 'Journal Entry' },
  { type: 'Payment', color: '#FFEAA7', label: 'Payment' },
  { type: 'Customer', color: '#DDA0DD', label: 'Customer' },
  { type: 'Product', color: '#98D8C8', label: 'Product' },
  { type: 'Plant', color: '#F7DC6F', label: 'Plant' },
  { type: 'StorageLocation', color: '#D4AC0D', label: 'Storage Loc' },
  { type: 'ScheduleLine', color: '#FFB8B8', label: 'Sched Line' },
];

const SUGGESTIONS = [
  'Which products have the highest number of billing documents?',
  'Trace the full flow for sales order 740506',
  'Find sales orders that were delivered but not billed',
  'Show me the top customers by total order value',
  'Which plants handle the most deliveries?',
];

export default function Home() {
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Welcome to SAP Graph Explorer! I can help you explore the Order-to-Cash dataset. Ask me anything about sales orders, deliveries, billing documents, payments, products, or customers.',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const messagesEndRef = useRef(null);
  const canvasRef = useRef(null);
  const graphStateRef = useRef({
    nodes: [],
    edges: [],
    positions: {},
    velocities: {},
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragNode: null,
    dragStart: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    isPanning: false,
    hoveredNode: null,
    animationId: null,
    initialized: false,
  });

  // Fetch graph data
  useEffect(() => {
    fetch('/api/graph')
      .then((res) => res.json())
      .then((data) => {
        setGraphData(data);
        setGraphLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load graph:', err);
        setGraphLoading(false);
      });
  }, []);

  // Force-directed graph simulation on canvas
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const state = graphStateRef.current;

    // Initialize positions
    if (!state.initialized) {
      state.nodes = graphData.nodes;
      state.edges = graphData.edges;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      for (const node of state.nodes) {
        state.positions[node.id] = {
          x: cx + (Math.random() - 0.5) * 600,
          y: cy + (Math.random() - 0.5) * 400,
        };
        state.velocities[node.id] = { x: 0, y: 0 };
      }
      state.initialized = true;
    }

    // Resize canvas
    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Physics simulation
    const nodeMap = {};
    for (const n of state.nodes) nodeMap[n.id] = n;

    const edgeMap = {};
    for (const e of state.edges) {
      if (!edgeMap[e.source]) edgeMap[e.source] = [];
      if (!edgeMap[e.target]) edgeMap[e.target] = [];
      edgeMap[e.source].push(e);
      edgeMap[e.target].push(e);
    }

    let steps = 0;
    const MAX_STEPS = 300;

    function simulate() {
      if (steps >= MAX_STEPS) return;
      steps++;
      const alpha = 1 - steps / MAX_STEPS;
      const nodes = state.nodes;
      const pos = state.positions;
      const vel = state.velocities;

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i].id;
          const b = nodes[j].id;
          const dx = pos[a].x - pos[b].x;
          const dy = pos[a].y - pos[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (3000 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          vel[a].x += fx;
          vel[a].y += fy;
          vel[b].x -= fx;
          vel[b].y -= fy;
        }
      }

      // Attraction
      for (const edge of state.edges) {
        const a = edge.source;
        const b = edge.target;
        if (!pos[a] || !pos[b]) continue;
        const dx = pos[b].x - pos[a].x;
        const dy = pos[b].y - pos[a].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 80) * 0.01 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        vel[a].x += fx;
        vel[a].y += fy;
        vel[b].x -= fx;
        vel[b].y -= fy;
      }

      // Center gravity
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (const n of nodes) {
        const dx = cx - pos[n.id].x;
        const dy = cy - pos[n.id].y;
        vel[n.id].x += dx * 0.0005 * alpha;
        vel[n.id].y += dy * 0.0005 * alpha;
      }

      // Apply velocities
      for (const n of nodes) {
        if (state.dragNode === n.id) continue;
        vel[n.id].x *= 0.6;
        vel[n.id].y *= 0.6;
        pos[n.id].x += vel[n.id].x;
        pos[n.id].y += vel[n.id].y;
      }
    }

    function getNodeRadius(node) {
      const base = 6;
      if (node.type === 'Customer') return base + 4;
      if (node.type === 'SalesOrder') return base + 2;
      if (node.type === 'Product') return base + 1;
      return base;
    }

    function draw() {
      simulate();

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(state.offsetX, state.offsetY);
      ctx.scale(state.scale, state.scale);

      const pos = state.positions;

      // Draw edges
      ctx.lineWidth = 0.5;
      for (const edge of state.edges) {
        if (!pos[edge.source] || !pos[edge.target]) continue;
        const isHighlighted = highlightedNodes.has(edge.source) && highlightedNodes.has(edge.target);
        ctx.strokeStyle = isHighlighted
          ? 'rgba(99, 102, 241, 0.6)'
          : 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.moveTo(pos[edge.source].x, pos[edge.source].y);
        ctx.lineTo(pos[edge.target].x, pos[edge.target].y);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of state.nodes) {
        if (!pos[node.id]) continue;
        const r = getNodeRadius(node);
        const isHovered = state.hoveredNode === node.id;
        const isSelected = selectedNode?.id === node.id;
        const isHighlighted = highlightedNodes.has(node.id);

        // Glow
        if (isHighlighted || isSelected) {
          ctx.beginPath();
          ctx.arc(pos[node.id].x, pos[node.id].y, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = node.color + '33';
          ctx.fill();
        }

        // Node
        ctx.beginPath();
        ctx.arc(pos[node.id].x, pos[node.id].y, isHovered ? r + 2 : r, 0, Math.PI * 2);
        ctx.fillStyle = isHighlighted ? node.color : (node.color + 'CC');
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label for hovered/important nodes
        if (isHovered || isSelected || isHighlighted) {
          ctx.font = '10px Inter, sans-serif';
          ctx.fillStyle = '#e8e8f0';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, pos[node.id].x, pos[node.id].y + r + 14);
        }
      }

      ctx.restore();
      state.animationId = requestAnimationFrame(draw);
    }

    // Mouse handlers
    function getMousePos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - state.offsetX) / state.scale,
        y: (e.clientY - rect.top - state.offsetY) / state.scale,
      };
    }

    function findNodeAt(mx, my) {
      for (let i = state.nodes.length - 1; i >= 0; i--) {
        const n = state.nodes[i];
        const p = state.positions[n.id];
        if (!p) continue;
        const dx = mx - p.x;
        const dy = my - p.y;
        if (dx * dx + dy * dy < 200) return n;
      }
      return null;
    }

    function onMouseDown(e) {
      const { x, y } = getMousePos(e);
      const node = findNodeAt(x, y);
      if (node) {
        state.dragNode = node.id;
        state.isDragging = true;
      } else {
        state.isPanning = true;
        state.panStart = { x: e.clientX - state.offsetX, y: e.clientY - state.offsetY };
      }
    }

    function onMouseMove(e) {
      const { x, y } = getMousePos(e);

      if (state.isDragging && state.dragNode) {
        state.positions[state.dragNode] = { x, y };
        state.velocities[state.dragNode] = { x: 0, y: 0 };
      } else if (state.isPanning) {
        state.offsetX = e.clientX - state.panStart.x;
        state.offsetY = e.clientY - state.panStart.y;
      } else {
        const node = findNodeAt(x, y);
        state.hoveredNode = node ? node.id : null;
        canvas.style.cursor = node ? 'pointer' : 'grab';
      }
    }

    function onMouseUp() {
      if (state.isDragging && state.dragNode) {
        const node = state.nodes.find(n => n.id === state.dragNode);
        if (node) setSelectedNode(node);
      }
      state.isDragging = false;
      state.dragNode = null;
      state.isPanning = false;
    }

    function onWheel(e) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const zoom = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.2, Math.min(5, state.scale * zoom));

      state.offsetX = mx - (mx - state.offsetX) * (newScale / state.scale);
      state.offsetY = my - (my - state.offsetY) * (newScale / state.scale);
      state.scale = newScale;
    }

    function onClick(e) {
      const { x, y } = getMousePos(e);
      const node = findNodeAt(x, y);
      if (node) {
        setSelectedNode(node);
      }
    }

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    state.animationId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
      if (state.animationId) cancelAnimationFrame(state.animationId);
    };
  }, [graphData, highlightedNodes, selectedNode]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Send message
  const sendMessage = useCallback(async (text) => {
    const msg = text || inputValue.trim();
    if (!msg || isLoading) return;

    setInputValue('');
    const userMessage = { role: 'user', content: msg };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });

      const data = await res.json();

      const assistantMsg = {
        role: 'assistant',
        content: data.answer || data.error || 'No response',
        sql: data.sql,
        data: data.data,
        totalRows: data.totalRows,
        isRelevant: data.isRelevant,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Highlight nodes if data contains node IDs
      if (data.data && data.data.length > 0) {
        const nodeIds = new Set();
        for (const row of data.data) {
          if (row.salesOrder) nodeIds.add(`SO:${row.salesOrder}`);
          if (row.deliveryDocument) nodeIds.add(`DEL:${row.deliveryDocument}`);
          if (row.billingDocument) nodeIds.add(`BILL:${row.billingDocument}`);
          if (row.customer) nodeIds.add(`CUST:${row.customer}`);
          if (row.product || row.material) nodeIds.add(`PROD:${row.product || row.material}`);
          if (row.plant) nodeIds.add(`PLT:${row.plant}`);
        }
        setHighlightedNodes(nodeIds);
        setTimeout(() => setHighlightedNodes(new Set()), 10000);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetView = () => {
    const state = graphStateRef.current;
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>
          <span className="icon">◈</span>
          SAP Graph Explorer
        </h1>
        <div className="header-stats">
          {graphData && (
            <>
              <div className="stat-badge">
                <span className="count">{graphData.nodes.length}</span> Nodes
              </div>
              <div className="stat-badge">
                <span className="count">{graphData.edges.length}</span> Edges
              </div>
            </>
          )}
        </div>
      </header>

      <div className="main-content">
        {/* Graph Panel */}
        <div className="graph-panel">
          {graphLoading ? (
            <div className="graph-loading">
              <div className="spinner" />
              <span>Building graph...</span>
            </div>
          ) : (
            <>
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />

              <div className="graph-controls">
                <button className="graph-btn" onClick={resetView}>
                  Reset View
                </button>
                <button className="graph-btn" onClick={() => setSelectedNode(null)}>
                  Clear Selection
                </button>
              </div>

              <div className="graph-legend">
                {LEGEND_ITEMS.map((item) => (
                  <div key={item.type} className="legend-item">
                    <div
                      className="legend-dot"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                  </div>
                ))}
              </div>

              {/* Node Detail Panel */}
              {selectedNode && (
                <div className="node-detail">
                  <div className="node-detail-header">
                    <h3>
                      <span
                        className="node-type-badge"
                        style={{ backgroundColor: selectedNode.color }}
                      >
                        {selectedNode.type}
                      </span>
                      {selectedNode.label}
                    </h3>
                    <button
                      className="close-btn"
                      onClick={() => setSelectedNode(null)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="node-detail-content">
                    {selectedNode.metadata &&
                      Object.entries(selectedNode.metadata).map(([key, value]) => {
                        if (value === null || value === undefined || value === '') return null;
                        return (
                          <div key={key} className="detail-row">
                            <span className="detail-key">{key}</span>
                            <span className="detail-value">{String(value)}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Chat Panel */}
        <div className="chat-panel">
          <div className="chat-header">
            <h2>💬 Query Assistant</h2>
            <span className="badge">AI-Powered</span>
          </div>

          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <span className="message-label">
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </span>
                <div className="message-bubble">{msg.content}</div>

                {msg.sql && (
                  <details className="message-sql">
                    <summary>View SQL Query</summary>
                    {msg.sql}
                  </details>
                )}

                {msg.data && msg.data.length > 0 && (
                  <div className="message-data">
                    <table>
                      <thead>
                        <tr>
                          {Object.keys(msg.data[0]).map((key) => (
                            <th key={key}>{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.slice(0, 10).map((row, ri) => (
                          <tr key={ri}>
                            {Object.values(row).map((val, ci) => (
                              <td key={ci}>{val !== null ? String(val) : '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {msg.totalRows > 10 && (
                      <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Showing 10 of {msg.totalRows} results
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="message assistant">
                <span className="message-label">Assistant</span>
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && (
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-container">
            <div className="chat-input-wrapper">
              <textarea
                className="chat-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the SAP O2C data..."
                rows={1}
                disabled={isLoading}
              />
              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={isLoading || !inputValue.trim()}
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
