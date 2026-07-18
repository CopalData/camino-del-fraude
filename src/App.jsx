import React, { useState, useEffect, useRef, useReducer, useMemo } from 'react';
import * as d3 from 'd3';
import { Network, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Tokens — idénticos al diseño aprobado                               */
/* ------------------------------------------------------------------ */

const PALETTE = {
  void: '#0A0A0C',
  panel: '#131317',
  panelAlt: '#0E0E11',
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.18)',
  textPrimary: '#F2F1ED',
  textSecondary: '#9A9AA1',
  textMuted: '#5C5C63',
  accent: '#00BCE4',
  accentGlow: '#4DD8F5',
  partyBlue: '#122F5C',
  partyBlueGlow: '#2F5C9E',
};

// El id del nodo central lo define el backend real — ahí llega como 'P_CENTRAL'
// (así lo devuelve /api/red), no como '1' del prototipo con datos locales.
const CENTRAL_ID = 'P_CENTRAL';
const API_BASE = 'https://blue-api-ekgw.onrender.com';

const GLOBAL_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
::selection { background: rgba(212,101,59,0.35); }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
.trama-ghost-btn:hover { background-color: rgba(255,255,255,0.05); }
`;

/* ------------------------------------------------------------------ */
/*  Piezas — copiadas tal cual del diseño aprobado                      */
/* ------------------------------------------------------------------ */

function initialsOf(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Avatar({ name, photoUrl, size = 80, ring, halo }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1.5px solid ${ring}`,
        backgroundColor: PALETTE.panelAlt,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: halo ? '0 0 0 6px rgba(47,92,158,0.25)' : 'none',
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
      }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: PALETTE.textSecondary,
            fontSize: size * 0.3,
            letterSpacing: 1,
          }}
        >
          {initialsOf(name)}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Graph canvas — d3-force physics (idéntico al diseño aprobado)       */
/* ------------------------------------------------------------------ */

function GraphCanvas({ data, onNodeClick, selectedId }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 900, height: 600 });
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const simRef = useRef(null);
  const dragMovedRef = useRef(false);
  const [, bump] = useReducer((x) => x + 1, 0);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const prevPositions = {};
    nodesRef.current.forEach((n) => {
      prevPositions[n.id] = { x: n.x, y: n.y };
    });

    const simNodes = data.nodes.map((n) => {
      const p = prevPositions[n.id];
      return {
        ...n,
        x: p ? p.x : dims.width / 2 + (Math.random() - 0.5) * 160,
        y: p ? p.y : dims.height / 2 + (Math.random() - 0.5) * 160,
      };
    });
    const simLinks = data.links.map((l) => ({ ...l }));

    const sim = d3
      .forceSimulation(simNodes)
      .force('link', d3.forceLink(simLinks).id((d) => d.id).distance(160).strength(0.65))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('center', d3.forceCenter(dims.width / 2, dims.height / 2))
      .force('collide', d3.forceCollide((d) => (d.id === CENTRAL_ID ? 74 : 58)))
      .on('tick', () => bump());

    nodesRef.current = simNodes;
    linksRef.current = simLinks;
    simRef.current = sim;

    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.nodes.length, data.links.length, dims.width, dims.height]);

  function handlePointerDown(e, id) {
    e.preventDefault();
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node || !simRef.current) return;
    dragMovedRef.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    simRef.current.alphaTarget(0.25).restart();
    node.fx = node.x;
    node.fy = node.y;
    const rect = containerRef.current.getBoundingClientRect();

    function move(ev) {
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) {
        dragMovedRef.current = true;
      }
      node.fx = ev.clientX - rect.left;
      node.fy = ev.clientY - rect.top;
      bump();
    }
    function up() {
      simRef.current.alphaTarget(0);
      node.fx = null;
      node.fy = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const connectedIds = useMemo(() => {
    if (!hoveredId) return null;
    const s = new Set([hoveredId]);
    linksRef.current.forEach((l) => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (sid === hoveredId) s.add(tid);
      if (tid === hoveredId) s.add(sid);
    });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: PALETTE.void,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
      }}
    >
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {linksRef.current.map((l) => {
          const sx = l.source && l.source.x;
          const sy = l.source && l.source.y;
          const tx = l.target && l.target.x;
          const ty = l.target && l.target.y;
          if (sx == null || tx == null) return null;
          const sid = l.source.id;
          const tid = l.target.id;
          const isHot = hoveredId && (sid === hoveredId || tid === hoveredId);
          const dim = hoveredId && !isHot;
          return (
            <line
              key={l.id}
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke={isHot ? PALETTE.partyBlueGlow : PALETTE.partyBlue}
              strokeWidth={isHot ? 2.5 : 1.25}
              style={{
                transition: 'stroke 180ms ease, opacity 180ms ease',
                opacity: dim ? 0.12 : isHot ? 1 : 0.65,
              }}
            />
          );
        })}
      </svg>

      <div style={{ position: 'absolute', inset: 0 }}>
        {nodesRef.current.map((n) => {
          const isHovered = hoveredId === n.id;
          const isSelected = selectedId === n.id;
          const isCentral = n.id === CENTRAL_ID;
          const isConnected = connectedIds ? connectedIds.has(n.id) : true;
          const dim = hoveredId && !isConnected;
          const ring = isCentral
            ? isHovered || isSelected
              ? PALETTE.partyBlueGlow
              : PALETTE.partyBlue
            : isSelected
            ? PALETTE.accent
            : isHovered
            ? PALETTE.accentGlow
            : 'rgba(255,255,255,0.16)';
          const avatarSize = isCentral ? 96 : 76;
          return (
            <div
              key={n.id}
              onPointerDown={(e) => handlePointerDown(e, n.id)}
              onMouseEnter={() => setHoveredId(n.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => {
                if (dragMovedRef.current) return;
                onNodeClick(n.id);
              }}
              style={{
                position: 'absolute',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                cursor: 'grab',
                userSelect: 'none',
                left: (n.x || 0) - 65,
                top: (n.y || 0) - 46,
                width: 130,
                transform: `scale(${isHovered ? 1.1 : 1})`,
                transformOrigin: 'center top',
                transition: 'opacity 180ms ease, transform 120ms ease-out',
                opacity: dim ? 0.25 : 1,
                zIndex: isHovered || isSelected ? 20 : 5,
              }}
            >
              <Avatar name={n.name} photoUrl={n.photoUrl} size={avatarSize} ring={ring} halo={isCentral} />
              <span
                style={{
                  marginTop: 8,
                  fontWeight: 500,
                  lineHeight: 1.2,
                  fontFamily: 'Inter, sans-serif',
                  color: PALETTE.textPrimary,
                  fontSize: isCentral ? 13.5 : 12.5,
                }}
              >
                {n.name}
              </span>
              <span
                style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  lineHeight: 1.2,
                  marginTop: 2,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: PALETTE.textMuted,
                }}
              >
                {n.cargoActual}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontFamily: "'JetBrains Mono', monospace",
          color: PALETTE.textMuted,
        }}
      >
        Arrastra los nodos · Pasa el cursor para resaltar vínculos
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Drawer (idéntico al diseño aprobado, sin isAdmin/onDelete:           */
/*  esta página no puede modificar nada)                                */
/* ------------------------------------------------------------------ */

function Field({ label, value, accent }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        borderBottom: `1px solid ${PALETTE.border}`,
        paddingBottom: 12,
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          paddingTop: 2,
          fontFamily: "'JetBrains Mono', monospace",
          color: PALETTE.textMuted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'right',
          color: accent ? PALETTE.accentGlow : PALETTE.textPrimary,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Drawer({ node, onClose }) {
  const open = !!node;
  return (
    <>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={onClose} />}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100%',
          zIndex: 40,
          transition: 'transform 300ms ease-out',
          width: 400,
          maxWidth: '92vw',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          backgroundColor: PALETTE.panel,
          borderLeft: `1px solid ${PALETTE.border}`,
        }}
      >
        {node && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                flexShrink: 0,
                borderBottom: `1px solid ${PALETTE.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: PALETTE.textMuted,
                }}
              >
                Expediente
              </span>
              <button
                onClick={onClose}
                className="trama-ghost-btn"
                style={{
                  padding: 6,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                }}
              >
                <X size={16} color={PALETTE.textSecondary} />
              </button>
            </div>

            <div style={{ padding: '28px 24px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <Avatar
                  name={node.name}
                  photoUrl={node.photoUrl}
                  size={node.id === CENTRAL_ID ? 132 : 120}
                  ring={node.id === CENTRAL_ID ? PALETTE.partyBlue : 'rgba(255,255,255,0.16)'}
                  halo={node.id === CENTRAL_ID}
                />
              </div>
              <h2
                style={{
                  textAlign: 'center',
                  fontSize: 19,
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  color: PALETTE.textPrimary,
                  margin: 0,
                }}
              >
                {node.name}
              </h2>

              <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Cargo actual" value={node.cargoActual || '—'} accent />
                <Field label="Ex cargo" value={node.exCargo || '—'} />
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: PALETTE.textMuted,
                    }}
                  >
                    Explicación
                  </div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.6, color: PALETTE.textSecondary, margin: 0 }}>
                    {node.explicacion || 'Sin información adicional registrada.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CenterMessage({ text, color }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontFamily: "'JetBrains Mono', monospace",
        color: color || PALETTE.textMuted,
        zIndex: 1,
      }}
    >
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header — sin Admin Login, sin badge "Datos de ejemplo" (esta        */
/*  página consume datos reales del backend, no mock)                    */
/* ------------------------------------------------------------------ */

function Header() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '16px 20px',
        flexShrink: 0,
        borderBottom: `1px solid ${PALETTE.border}`,
      }}
    >
      <Network size={18} color={PALETTE.accent} />
      <span
        style={{
          fontSize: 15,
          fontFamily: "'JetBrains Mono', monospace",
          color: PALETTE.textPrimary,
          fontWeight: 600,
          letterSpacing: '0.03em',
        }}
      >
        Conexiones del Fraude Electoral
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App — solo lectura: carga de /api/red, sin ninguna vía de edición   */
/* ------------------------------------------------------------------ */

export default function App() {
  const [data, setData] = useState({ nodes: [], links: [] });
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/red`)
      .then((res) => {
        if (!res.ok) throw new Error('Respuesta no OK del backend');
        return res.json();
      })
      .then((json) => {
        setData(json);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setSelectedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedNode = data.nodes.find((n) => n.id === selectedId) || null;

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: PALETTE.void }}>
      <style>{GLOBAL_STYLE}</style>

      <Header />

      <div style={{ flex: 1, position: 'relative', minHeight: 280 }}>
        {status === 'loading' && <CenterMessage text="Cargando red..." />}
        {status === 'error' && <CenterMessage text="No se pudo conectar con el backend." color="#E5484D" />}
        <GraphCanvas data={data} onNodeClick={setSelectedId} selectedId={selectedId} />
      </div>

      <Drawer node={selectedNode} onClose={() => setSelectedId(null)} />
    </div>
  );
}
