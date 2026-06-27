import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Network, ZoomIn, ZoomOut, RefreshCw, Hexagon, Search, TrendingUp, Maximize2, Minimize2 } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';
import { Sankey, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function KnowledgeGraphViewer({ domain, token, refreshTrigger }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('neon');
  const [graphScope, setGraphScope] = useState('domain');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fgRef = useRef();

  const fetchGraph = async () => {
    try {
      setLoading(true);
      let url = `http://127.0.0.1:8000/api/knowledge-graph?`;
      if (domain) url += `domain=${domain}&`;
      if (graphScope) url += `view_type=${graphScope}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch graph data');
      const data = await response.json();
      setGraphData(data);
    } catch (err) {
      console.error("Graph Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, [domain, token, graphScope, refreshTrigger]);

  useEffect(() => {
    if (fgRef.current && !loading) {
      fgRef.current.d3Force('charge').strength(viewMode === 'glass' ? -4000 : -2000).distanceMax(viewMode === 'glass' ? 1200 : 800);
      fgRef.current.d3Force('link').distance(viewMode === 'glass' ? 200 : 80);
      fgRef.current.d3Force('collide', d3 => {
        // Only load d3 dynamically if possible, or just skip collide if d3 is not in scope
        // Actually react-force-graph doesn't expose d3 directly here, so we skip collide force.
      });
    }
  }, [graphData, loading, viewMode]);

  const handleZoomIn = () => fgRef.current?.zoom(fgRef.current.zoom() * 1.2, 400);
  const handleZoomOut = () => fgRef.current?.zoom(fgRef.current.zoom() / 1.2, 400);

  // ----------------------------------------------------
  // NEON MODE RENDERING
  // ----------------------------------------------------
  const neonColors = {
    'root': '#ffffff',
    'domain': '#ff3366',
    'user': '#bc13fe',
    'document': '#00d2ff',
    'concept': '#00ff66'
  };

  const drawNeonNode = (node, ctx, globalScale) => {
    const label = node.id;
    
    // Search Highlight Logic
    const isMatch = searchQuery && label.toLowerCase().includes(searchQuery.toLowerCase());
    const isFaded = searchQuery && !isMatch;
    
    const fontSize = 14 / globalScale;
    ctx.font = `${fontSize}px Inter, sans-serif`;
    
    const nodeColor = neonColors[node.type] || '#888888';
    
    ctx.globalAlpha = isFaded ? 0.2 : 1;
    
    // Draw Glow
    ctx.shadowBlur = isMatch ? 25 : 15;
    ctx.shadowColor = isMatch ? '#ffffff' : nodeColor;
    ctx.fillStyle = isMatch ? '#ffffff' : nodeColor;
    ctx.beginPath();
    ctx.arc(node.x, node.y, isMatch ? 8 : 6, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.shadowBlur = 0; // Reset
    
    // Draw Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isMatch ? '#ffffff' : 'rgba(255,255,255,0.8)';
    ctx.fillText(label, node.x, node.y + 12);
    
    ctx.globalAlpha = 1;
  };

  // ----------------------------------------------------
  // SANKEY MODE DATA & RENDERING
  // ----------------------------------------------------
  const sankeyData = useMemo(() => {
    if (!graphData || !graphData.nodes.length) return { nodes: [], links: [] };
    
    const nodes = graphData.nodes.map(n => ({ name: n.id, type: n.type }));
    const links = [];
    
    const typeOrder = { 'root': 0, 'domain': 1, 'user': 2, 'document': 3, 'concept': 4 };
    
    graphData.links.forEach(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      
      const sIndex = nodes.findIndex(n => n.name === sId);
      const tIndex = nodes.findIndex(n => n.name === tId);
      
      if (sIndex !== -1 && tIndex !== -1 && sIndex !== tIndex) {
        // Enforce strict left-to-right hierarchy to prevent cycles (which break Sankeys)
        const sType = nodes[sIndex].type;
        const tType = nodes[tIndex].type;
        const sLevel = typeOrder[sType] !== undefined ? typeOrder[sType] : -1;
        const tLevel = typeOrder[tType] !== undefined ? typeOrder[tType] : -1;
        
        if (sLevel < tLevel) {
          links.push({
            source: sIndex,
            target: tIndex,
            value: 10,
            label: l.label
          });
        }
      }
    });

    return { nodes, links };
  }, [graphData]);

  const CustomSankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
    const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';
    
    // Sometimes containerWidth isn't available on the node, use a fallback
    const cw = containerWidth || 1000;
    const isOut = x + width + 6 > cw;
    
    const isMatch = searchQuery && payload.name && payload.name.toLowerCase().includes(searchQuery.toLowerCase());
    const isFaded = searchQuery && !isMatch;
    
    const fill = isMatch ? 'var(--accent-color)' : (isLightMode ? '#CBD5E1' : '#334155');
    
    return (
      <g opacity={isFaded ? 0.2 : 1} style={{ transition: 'opacity 0.3s' }}>
        <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />
        <text
          x={isOut ? x - 6 : x + width + 6}
          y={y + height / 2}
          fill={isLightMode ? '#0f172a' : '#f8fafc'}
          fontSize={12}
          fontWeight={500}
          textAnchor={isOut ? 'end' : 'start'}
          alignmentBaseline="middle"
        >
          {payload.name}
        </text>
      </g>
    );
  };

  const CustomSankeyLink = ({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index, payload }) => {
    const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';
    
    const isMatch = searchQuery && payload.label && payload.label.toLowerCase().includes(searchQuery.toLowerCase());
    const isFaded = searchQuery && !isMatch;
    
    const fill = isMatch ? 'rgba(255, 122, 24, 0.4)' : (isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)');
    const stroke = isMatch ? '#ff7a18' : (isLightMode ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)');
    
    return (
      <path
        d={`
          M${sourceX},${sourceY + linkWidth / 2}
          C${sourceControlX},${sourceY + linkWidth / 2} ${targetControlX},${targetY + linkWidth / 2} ${targetX},${targetY + linkWidth / 2}
          L${targetX},${targetY - linkWidth / 2}
          C${targetControlX},${targetY - linkWidth / 2} ${sourceControlX},${sourceY - linkWidth / 2} ${sourceX},${sourceY - linkWidth / 2}
          Z
        `}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        opacity={isFaded ? 0.1 : 1}
        style={{ transition: 'all 0.3s' }}
      />
    );
  };

  // ----------------------------------------------------
  // EDGE TEXT RENDERING (For Neon Mode)
  // ----------------------------------------------------
  const drawEdgeLabel = (link, ctx, globalScale) => {
    if (!link.label) return;
    
    // Search Highlight Logic
    const isMatch = searchQuery && link.label.toLowerCase().includes(searchQuery.toLowerCase());
    const isFaded = searchQuery && !isMatch;
    
    const start = link.source;
    const end = link.target;
    if (typeof start.x !== 'number' || typeof end.x !== 'number') return;
    
    const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';
    
    // Middle of the line
    const textPos = {
      x: start.x + (end.x - start.x) / 2,
      y: start.y + (end.y - start.y) / 2
    };

    const fontSize = 10 / globalScale;
    ctx.font = `${fontSize}px Inter, sans-serif`;
    
    const textWidth = ctx.measureText(link.label).width;
    
    ctx.globalAlpha = isFaded ? 0.2 : 1;
    
    // Solid background pill for text
    ctx.fillStyle = isLightMode ? '#ffffff' : '#0a0a0f';
    ctx.beginPath();
    ctx.roundRect(textPos.x - textWidth / 2 - 4, textPos.y - fontSize / 2 - 4, textWidth + 8, fontSize + 8, 4);
    ctx.fill();
    
    ctx.strokeStyle = isMatch ? '#ff7a18' : (isLightMode ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)');
    ctx.lineWidth = isMatch ? 2 / globalScale : 1 / globalScale;
    ctx.stroke();

    // Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isMatch ? '#ff7a18' : (isLightMode ? '#09090b' : 'rgba(0, 255, 102, 0.9)');
    
    ctx.fillText(link.label, textPos.x, textPos.y);
    ctx.globalAlpha = 1;
  };

  return (
    <div style={isFullScreen ? {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', zIndex: 99999, background: 'var(--bg-color)', padding: 24, boxSizing: 'border-box', display: 'flex', flexDirection: 'column'
    } : { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Network size={20} color="var(--accent-color)" />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Interactive Knowledge Graph</h2>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Search Bar */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card-bg)', borderRadius: 20, padding: '4px 12px', border: '1px solid var(--border-color)' }}>
            <Search size={14} color="var(--muted-text)" style={{ marginRight: 6 }} />
            <input 
              type="text" 
              placeholder="Search graph..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-color)', fontSize: '0.85rem', outline: 'none', width: 120 }}
            />
          </div>

          {/* Graph Scope Toggle */}
          <div style={{ display: 'flex', background: 'var(--card-bg)', borderRadius: 20, padding: 4, border: '1px solid var(--border-color)' }}>
            <button 
              onClick={() => setGraphScope('domain')}
              style={{
                padding: '4px 12px', borderRadius: 16, border: 'none', fontSize: '0.8rem',
                background: graphScope === 'domain' ? 'var(--accent-color)' : 'transparent',
                color: graphScope === 'domain' ? '#fff' : 'var(--text-color)',
                cursor: 'pointer', transition: 'all 0.3s'
              }}>
              Domain Graph
            </button>
            <button 
              onClick={() => setGraphScope('me')}
              style={{
                padding: '4px 12px', borderRadius: 16, border: 'none', fontSize: '0.8rem',
                background: graphScope === 'me' ? 'var(--accent-color)' : 'transparent',
                color: graphScope === 'me' ? '#fff' : 'var(--text-color)',
                cursor: 'pointer', transition: 'all 0.3s'
              }}>
              My Graph
            </button>
          </div>
          
          {/* Theme Switches */}
          <div style={{ display: 'flex', background: 'var(--card-bg)', borderRadius: 20, padding: 4, border: '1px solid var(--border-color)' }}>
            <button 
              onClick={() => setViewMode('neon')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 16, border: 'none', fontSize: '0.8rem',
                background: viewMode === 'neon' ? 'var(--accent-color)' : 'transparent',
                color: viewMode === 'neon' ? '#fff' : 'var(--text-color)',
                cursor: 'pointer', transition: 'all 0.3s'
              }}>
              <Hexagon size={14} /> Neon Cyberpunk
            </button>
            <button 
              onClick={() => setViewMode('sankey')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 16, border: 'none', fontSize: '0.8rem',
                background: viewMode === 'sankey' ? 'var(--accent-color)' : 'transparent',
                color: viewMode === 'sankey' ? '#fff' : 'var(--text-color)',
                cursor: 'pointer', transition: 'all 0.3s'
              }}>
              <TrendingUp size={14} /> Sankey Flow
            </button>
          </div>

          <button className="secondary-button" onClick={fetchGraph} title="Refresh Graph"><RefreshCw size={16} /></button>
          <button className="secondary-button" onClick={() => setIsFullScreen(!isFullScreen)} title={isFullScreen ? "Exit Full Screen" : "Full Screen"}>
            {isFullScreen ? <Minimize2 size={16} color="var(--accent-color)" /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      
      <div style={{ 
        flex: 1, 
        position: 'relative', 
        borderRadius: 16, 
        overflow: 'hidden', 
        border: '1px solid var(--border-color)',
        background: viewMode === 'neon' ? '#0a0a0f' : 'var(--panel-bg)' 
      }}>
        {loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <div className="thinking-dots"><span></span><span></span><span></span></div>
          </div>
        ) : viewMode === 'sankey' ? (
          <div style={{ width: '100%', height: '100%', padding: '40px', boxSizing: 'border-box' }}>
            {sankeyData.nodes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={sankeyData}
                  node={<CustomSankeyNode />}
                  link={<CustomSankeyLink />}
                  nodePadding={30}
                  margin={{ top: 20, right: 150, bottom: 20, left: 20 }}
                  linkCurvature={0.25}
                  iterations={64}
                >
                  <RechartsTooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      if (data.source) { // Link
                        return (
                          <div style={{ background: 'var(--card-bg)', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                            <p style={{ margin: 0, fontWeight: 500 }}>{data.source.name} ➔ {data.target.name}</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted-text)' }}>Relation: {data.label}</p>
                          </div>
                        );
                      } else { // Node
                        return (
                          <div style={{ background: 'var(--card-bg)', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                            <p style={{ margin: 0, fontWeight: 600 }}>{data.name}</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted-text)' }}>Type: {data.type?.toUpperCase()}</p>
                          </div>
                        );
                      }
                    }
                    return null;
                  }} />
                </Sankey>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-text)' }}>
                No flow data available for Sankey diagram.
              </div>
            )}
          </div>
        ) : (
          graphData?.nodes?.length > 0 ? (
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
            nodeCanvasObject={drawNeonNode}
            
            // Edge styling
            linkColor={() => 'rgba(0, 255, 102, 0.4)'}
            linkOpacity={1}
            linkWidth={1}
            linkCurvature={0} 
            
            // Neon Particles
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={3}
            linkDirectionalParticleColor={() => '#00d2ff'}
            linkDirectionalParticleSpeed={0.005}
            
            // Arrow pointers for direction of flow
            linkDirectionalArrowLength={4}
            linkDirectionalArrowColor={() => 'rgba(0, 255, 102, 0.8)'}

            // Text on edges
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={drawEdgeLabel}

            // Physics tuning
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            onNodeClick={(node) => {
              if (fgRef.current) {
                fgRef.current.centerAt(node.x, node.y, 1000);
                fgRef.current.zoom(2.5, 2000);
              }
            }}
          />
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-text)' }}>
              No knowledge graph data available for your domain.
            </div>
          )
        )}

        {/* Legend Overlay for Neon Mode */}
        {viewMode === 'neon' && !loading && (
          <div style={{
            position: 'absolute', top: 12, right: 12, 
            background: 'rgba(10, 10, 15, 0.7)', padding: '8px 12px', 
            borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex', flexDirection: 'column', gap: 6, backdropFilter: 'blur(10px)',
            zIndex: 10
          }}>
            <h4 style={{ margin: 0, color: '#fff', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Legend</h4>
            {Object.entries(neonColors).filter(([k]) => k !== 'root').map(([key, color]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
                <span style={{ color: '#aaa', fontSize: '0.7rem', textTransform: 'capitalize' }}>{key}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
