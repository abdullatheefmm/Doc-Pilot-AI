import React, { useState, useEffect } from 'react';
import { Activity, Users, Shield, Database, Trash2, Download, Check, AlertTriangle, Play, Pause, FileText, CheckCircle, Search, RefreshCw, Network } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import MLOpsDashboard from './MLOpsDashboard';

import CustomDropdown from './CustomDropdown';
import KnowledgeGraphViewer from './KnowledgeGraphViewer';

export default function AdminDashboard({ session, showToast }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userCategory, setUserCategory] = useState('users');
  const [loading, setLoading] = useState(false);
  
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  
  const [autoSuspendEnabled, setAutoSuspendEnabled] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, userId: null, userName: '' });
  const [actionConfirmModal, setActionConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null, requirePassword: false });
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');
  const [logActionType, setLogActionType] = useState('all');
  const [logPurgeDays, setLogPurgeDays] = useState(30);

  const [searchQuery, setSearchQuery] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');

  const API_URL = 'http://127.0.0.1:8000/api';

  const fetchData = async () => {
    setLoading(true);
    try {
      const hdrs = { 'Authorization': `Bearer ${session.access_token}` };
      
      const [anRes, usRes, logRes, docRes, secRes] = await Promise.all([
        fetch(`${API_URL}/admin/analytics`, { headers: hdrs }),
        fetch(`${API_URL}/admin/users`, { headers: hdrs }),
        fetch(`${API_URL}/admin/audit_logs`, { headers: hdrs }),
        fetch(`${API_URL}/documents`, { headers: hdrs }),
        fetch(`${API_URL}/admin/security_alerts`, { headers: hdrs })
      ]);
      
      if(anRes.ok) setAnalytics(await anRes.json());
      if(usRes.ok) setUsers((await usRes.json()).users || []);
      if(logRes.ok) setLogs((await logRes.json()).logs || []);
      if(docRes.ok) setDocuments((await docRes.json()).documents || []);
      if(secRes.ok) setSecurityAlerts((await secRes.json()).alerts || []);
      
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchLogs = async () => {
    try {
      const hdrs = { 'Authorization': `Bearer ${session.access_token}` };
      const logRes = await fetch(`${API_URL}/admin/audit_logs`, { headers: hdrs });
      if(logRes.ok) setLogs((await logRes.json()).logs || []);
    } catch { /* ignore */ }
  };

  const deleteUser = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${deleteModal.userId}`, { 
        method: 'DELETE', headers: { 'Authorization': `Bearer ${session.access_token}` } 
      });
      if (res.ok) {
        setUsers(users.filter(u => u.user_id !== deleteModal.userId));
        setDeleteModal({ isOpen: false, userId: null, userName: '' });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const updateUserStatus = async (userId, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setUsers(users.map(u => u.user_id === userId ? { ...u, status: newStatus } : u));
      }
    } catch (e) { console.error(e); }
  };


  const forceDeleteDocument = (filename) => {
    setActionConfirmModal({
      isOpen: true,
      message: `Are you sure you want to permanently delete and purge vectors for ${filename}?`,
      requirePassword: true,
      onConfirm: async (password) => {
        setActionConfirmModal({ isOpen: false, message: '', onConfirm: null, requirePassword: false });
        setConfirmPassword('');
        setLoading(true);
        try {
          const res = await fetch(`${API_URL}/documents/${filename}?password=${encodeURIComponent(password)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) {
            setDocuments(documents.filter(d => d.name !== filename));
            showToast(`Successfully deleted ${filename}`);
          } else {
            const data = await res.json();
            showToast(`Failed to delete: ${data.detail || 'Unknown error'}`, 'error');
          }
        } catch(e) { 
          console.error(e); 
          showToast(`Error: ${e.message}`, 'error');
        }
        finally { setLoading(false); }
      }
    });
  };

  const toggleAutoSuspend = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/auto_suspend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ enabled: !autoSuspendEnabled })
      });
      if (res.ok) setAutoSuspendEnabled(!autoSuspendEnabled);
    } catch (e) { console.error(e); }
  };

  const purgeLogs = () => {
    setActionConfirmModal({
      isOpen: true,
      message: `Are you sure you want to delete logs older than ${logPurgeDays} days?`,
      onConfirm: async () => {
        setActionConfirmModal({ isOpen: false, message: '', onConfirm: null });
        try {
          const res = await fetch(`${API_URL}/admin/audit_logs/purge?days=${logPurgeDays}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) fetchLogs();
        } catch (e) { console.error(e); }
      }
    });
  };

  const deleteAuditLog = (logId) => {
    setActionConfirmModal({
      isOpen: true,
      message: `Are you sure you want to delete this specific audit log entry?`,
      onConfirm: async () => {
        setActionConfirmModal({ isOpen: false, message: '', onConfirm: null });
        try {
          const res = await fetch(`${API_URL}/admin/audit_logs/${logId}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) fetchLogs();
        } catch (e) { console.error(e); }
      }
    });
  };

  const downloadCSV = () => {
    if (filteredLogs.length === 0) return;
    const header = Object.keys(filteredLogs[0]).join(',');
    const rows = filteredLogs.map(obj => Object.values(obj).map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([`${header}\n${rows}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString()}.csv`;
    a.click();
  };

  // Filters
  const filteredUsers = users.filter(u => {
    if (userCategory === 'admins' && u.role !== 'super_admin') return false;
    if (userCategory === 'users' && u.role === 'super_admin') return false;
    
    if (domainFilter !== 'all' && u.role !== domainFilter && u.role !== 'super_admin') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.employee_id?.toLowerCase().includes(q));
    }
    return true;
  });

  const domains = ['engineering', 'hr', 'finance', 'legal', 'product', 'general'];

  const filteredLogs = logs.filter(l => {
    if (l.action_type === 'knowledge_graph_view' || l.action_type === 'document_view') return false;
    if (logActionType !== 'all') {
      if (logActionType === 'login_logout' && l.action_type !== 'login' && l.action_type !== 'logout') return false;
      else if (logActionType === 'ghost_mode' && l.action_type !== 'ghost_mode_on' && l.action_type !== 'ghost_mode_off') return false;
      else if (logActionType !== 'login_logout' && logActionType !== 'ghost_mode' && l.action_type !== logActionType) return false;
    }
    if (logStartDate && new Date(l.created_at) < new Date(logStartDate)) return false;
    if (logEndDate && new Date(l.created_at) > new Date(logEndDate)) return false;
    
    if (logSearchQuery) {
      const q = logSearchQuery.toLowerCase();
      const logUser = users.find(u => u.user_id === l.user_id || u.email === l.user_id);
      const userName = logUser?.full_name?.toLowerCase() || '';
      const userId = (logUser ? (logUser.employee_id || logUser.email || l.user_id) : (l.user_id || '')).toLowerCase();
      const domain = (l.domain || l.details?.domain || logUser?.role || 'Global').toLowerCase();
      const dateTime = new Date(l.created_at).toLocaleString().toLowerCase();
      const action = l.action_type?.toLowerCase() || '';
      return userName.includes(q) || userId.includes(q) || domain.includes(q) || dateTime.includes(q) || action.includes(q);
    }
    return true;
  });

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', color: 'var(--text-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Shield color="var(--accent-color)" size={28} /> Super Admin Control Center
          </h1>
          <p style={{ color: 'var(--muted-text)', margin: 0 }}>Manage system users, grant access, and view audit trails.</p>
        </div>
        <button className="secondary-btn" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
          <RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh
        </button>
      </div>

      {actionConfirmModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ background: 'var(--bg-color)', border: '1px solid rgba(255,255,255,0.1)', padding: 32, borderRadius: 16, maxWidth: 400, width: '90%', animation: 'slideIn 0.3s ease' }}>
            <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle color="#ef4444" /> Confirm Action</h3>
            <p style={{ color: 'var(--muted-text)', marginBottom: 24, lineHeight: 1.5 }}>{actionConfirmModal.message}</p>
            {actionConfirmModal.requirePassword && (
              <input
                type="password"
                placeholder="Enter your password to confirm"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.9rem', outline: 'none',
                  boxSizing: 'border-box', marginBottom: 24
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => {
                  setActionConfirmModal({ isOpen: false, message: '', onConfirm: null, requirePassword: false });
                  setConfirmPassword('');
                }}
                style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'var(--text-color)', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                onClick={() => actionConfirmModal.onConfirm(confirmPassword)}
                style={{ padding: '10px 20px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                disabled={actionConfirmModal.requirePassword && !confirmPassword}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ background: 'var(--bg-color)', border: '1px solid rgba(255,255,255,0.1)', padding: 32, borderRadius: 16, maxWidth: 400, width: '90%', animation: 'slideIn 0.3s ease' }}>
            <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle color="#ef4444" /> Delete User</h3>
            <p style={{ color: 'var(--muted-text)', marginBottom: 24, lineHeight: 1.5 }}>Are you sure you want to permanently delete {deleteModal.userName}?</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteModal({ isOpen: false, userId: null, userName: '' })} style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'var(--text-color)', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={deleteUser} style={{ padding: '10px 20px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, background: 'var(--card-bg-strong)', padding: 6, borderRadius: 16, width: 'max-content' }}>
        <button className="tab-btn" style={{ background: activeTab === 'dashboard' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'dashboard' ? 'var(--text-color)' : 'var(--muted-text)' }} onClick={() => setActiveTab('dashboard')}>
          <Activity size={16} /> Dashboard
        </button>
        <button className="tab-btn" style={{ background: activeTab === 'users' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'users' ? 'var(--text-color)' : 'var(--muted-text)' }} onClick={() => setActiveTab('users')}>
          <Users size={16} /> User Management
        </button>
        <button className="tab-btn" style={{ background: activeTab === 'documents' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'documents' ? 'var(--text-color)' : 'var(--muted-text)' }} onClick={() => setActiveTab('documents')}>
          <Database size={16} /> Document Management
        </button>
        <button className="tab-btn" style={{ background: activeTab === 'security' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'security' ? 'var(--text-color)' : 'var(--muted-text)' }} onClick={() => setActiveTab('security')}>
          <Shield size={16} /> Security Alerts
        </button>
        <button className="tab-btn" style={{ background: activeTab === 'logs' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'logs' ? 'var(--text-color)' : 'var(--muted-text)' }} onClick={() => setActiveTab('logs')}>
          <FileText size={16} /> Audit Logs
        </button>
        <button className="tab-btn" style={{ background: activeTab === 'graph' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'graph' ? 'var(--text-color)' : 'var(--muted-text)' }} onClick={() => setActiveTab('graph')}>
          <Network size={16} /> Knowledge Graph
        </button>
      </div>

      {activeTab === 'graph' && (
        <div style={{ animation: 'fadeIn 0.3s ease', height: 'calc(100vh - 200px)' }}>
          <KnowledgeGraphViewer domain="all" token={session?.access_token} refreshTrigger={documents} />
        </div>
      )}

      {activeTab === 'dashboard' && analytics && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 24 }}>
            <div className="stat-card">
              <h3>Total Queries</h3>
              <div className="value">{analytics.metrics.total_queries}</div>
            </div>
            <div className="stat-card">
              <h3>Tokens Used</h3>
              <div className="value">{analytics.metrics.total_tokens}</div>
            </div>
            <div className="stat-card">
              <h3>Est. Cost</h3>
              <div className="value">${analytics.metrics.estimated_cost}</div>
            </div>
            <div className="stat-card">
              <h3>Cache Hits</h3>
              <div className="value">{analytics.metrics.cache_hits}</div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem' }}>Query Volume (7 Days)</h3>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.trend}>
                      <defs>
                        <linearGradient id="colorQ" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="var(--muted-text)" fontSize={12} />
                      <YAxis stroke="var(--muted-text)" fontSize={12} />
                      <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-color)' }} />
                      <Area type="monotone" dataKey="queries" stroke="var(--accent-color)" fillOpacity={1} fill="url(#colorQ)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <MLOpsDashboard />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Knowledge Gaps</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {analytics.knowledge_gaps.map((gap, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 8 }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>"{gap.query}"</span>
                      <span style={{ color: '#ef4444', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: 4 }}>
                        {gap.confidence.toFixed(0)}% Conf
                      </span>
                    </div>
                  ))}
                  {analytics.knowledge_gaps.length === 0 && <p style={{color:'var(--muted-text)', margin:0}}>No significant gaps detected.</p>}
                </div>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Top Documents</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analytics.top_documents.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--muted-text)' }}>{d.doc}</span>
                      <span style={{ color: 'var(--primary-color)' }}>{d.hits} hits</span>
                    </div>
                  ))}
                  {analytics.top_documents.length === 0 && <p style={{color:'var(--muted-text)', margin:0}}>No retrievals yet.</p>}
                </div>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>User Distribution</h3>
                {users.length > 0 ? (
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(users.reduce((acc, user) => {
                            const role = user.role === 'super_admin' ? 'admin' : user.role;
                            acc[role] = (acc[role] || 0) + 1;
                            return acc;
                          }, {})).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {Object.entries(users.reduce((acc, user) => {
                            const role = user.role === 'super_admin' ? 'admin' : user.role;
                            acc[role] = (acc[role] || 0) + 1;
                            return acc;
                          }, {})).map((entry, index) => {
                            const colors = ['#10b981', '#3b82f6', '#a855f7', '#ff7a18', '#ef4444', '#f59e0b'];
                            return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="transparent" />;
                          })}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-color)' }} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.85rem', color: 'var(--text-color)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p style={{color:'var(--muted-text)', margin:0}}>No user data available.</p>
                )}
              </div>
              
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield color="#10b981" size={18} /> System Health
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--muted-text)' }}>Vector Database</span>
                    <span style={{ fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12}/> Online</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--muted-text)' }}>Auth Service</span>
                    <span style={{ fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12}/> Online</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--muted-text)' }}>LLM API</span>
                    <span style={{ fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12}/> Operational</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 4, height: 36 }}>
              <button 
                onClick={() => setUserCategory('users')}
                style={{ padding: '0 16px', borderRadius: 6, border: 'none', background: userCategory === 'users' ? 'var(--card-bg)' : 'transparent', color: userCategory === 'users' ? 'var(--text-color)' : 'var(--muted-text)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.2s' }}
              >
                Users
              </button>
              <button 
                onClick={() => setUserCategory('admins')}
                style={{ padding: '0 16px', borderRadius: 6, border: 'none', background: userCategory === 'admins' ? 'var(--card-bg)' : 'transparent', color: userCategory === 'admins' ? 'var(--text-color)' : 'var(--muted-text)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.2s' }}
              >
                Admins
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 16px', flex: 1, maxWidth: 350, height: 36, boxSizing: 'border-box' }}>
              <Search size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
              <input type="text" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.85rem', height: '100%' }} />
            </div>
            
            <CustomDropdown 
              value={domainFilter} 
              options={[{value: 'all', label: 'All Domains'}, ...domains.map(d => ({value: d, label: d.charAt(0).toUpperCase() + d.slice(1)}))]} 
              onChange={setDomainFilter} 
            />
          </div>

          <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--muted-text)' }}>
                  <th style={{ padding: '12px 8px' }}>Name</th>
                  <th style={{ padding: '12px 8px' }}>Employee ID</th>
                  <th style={{ padding: '12px 8px' }}>Email</th>
                  <th style={{ padding: '12px 8px' }}>Domain</th>
                  <th style={{ padding: '12px 8px' }}>Status</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--muted-text)' }}>No users found.</td></tr>
                ) : filteredUsers.map((u, i) => {
                  const statusColor = u.status === 'active' ? '#22c55e' : u.status === 'pending' ? '#3b82f6' : '#ef4444';
                  return (
                  <tr key={u.user_id} className="admin-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', animation: `slideIn 0.2s ease ${i * 0.02}s forwards`, opacity: 0 }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>{u.full_name}</td>
                    <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--muted-text)' }}>{u.employee_id}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--muted-text)' }}>{u.email}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ color: 'var(--primary-color)', background: 'rgba(59,130,246,0.1)', padding: '4px 10px', borderRadius: 8 }}>{u.role}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <select 
                        value={u.status || 'active'} 
                        onChange={(e) => updateUserStatus(u.user_id, e.target.value)}
                        style={{ background: 'transparent', color: statusColor, border: 'none', outline: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                      >
                        <option value="active" style={{ color: '#fff', background: '#1c1c1f' }}>Active</option>
                        <option value="pending" style={{ color: '#fff', background: '#1c1c1f' }}>Pending</option>
                        <option value="revoked" style={{ color: '#fff', background: '#1c1c1f' }}>Revoked</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {u.role !== 'super_admin' && (
                        <button title="Delete User" className="action-icon delete-btn" onClick={() => setDeleteModal({ isOpen: true, userId: u.user_id, userName: u.full_name })} disabled={loading}>
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 16px', flex: 1, maxWidth: 450, height: 36, boxSizing: 'border-box' }}>
              <Search size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
              <input type="text" placeholder="Search documents by name, domain, user, or date..." value={docSearchQuery} onChange={e => setDocSearchQuery(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.85rem', height: '100%' }} />
            </div>
          </div>
          <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--muted-text)' }}>
                  <th style={{ padding: '12px 8px' }}>Filename</th>
                  <th style={{ padding: '12px 8px' }}>Domain</th>
                  <th style={{ padding: '12px 8px' }}>Uploaded By</th>
                  <th style={{ padding: '12px 8px' }}>Date & Time</th>
                  <th style={{ padding: '12px 8px' }}>Status</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filteredDocs = documents.filter(doc => {
                    if (!docSearchQuery) return true;
                    const q = docSearchQuery.toLowerCase();
                    const name = doc.name?.toLowerCase() || '';
                    const domain = (doc.domain || 'Global').toLowerCase();
                    const docUser = users.find(u => u.user_id === doc.uploaded_by || u.email === doc.uploaded_by);
                    const uploaderStr = (docUser ? `${docUser.full_name || ''} ${docUser.employee_id || ''} ${docUser.email || ''}` : (doc.uploaded_by || '')).toLowerCase();
                    const dateStr = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString().toLowerCase() : (doc.date || '').toLowerCase();
                    return name.includes(q) || domain.includes(q) || uploaderStr.includes(q) || dateStr.includes(q);
                  });
                  return filteredDocs.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--muted-text)' }}>No documents found.</td></tr>
                  ) : filteredDocs.map((doc, i) => {
                    const docUser = users.find(u => u.user_id === doc.uploaded_by || u.email === doc.uploaded_by);
                    const displayUploader = docUser ? `${docUser.full_name || ''} (${docUser.employee_id || docUser.email})` : (doc.uploaded_by || 'Unknown');
                    return (
                    <tr key={doc.id || doc.name} className="admin-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', animation: `slideIn 0.2s ease ${i * 0.02}s forwards`, opacity: 0 }}>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>{doc.name}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ color: 'var(--primary-color)', background: 'rgba(59,130,246,0.1)', padding: '4px 10px', borderRadius: 8 }}>{doc.domain || 'Global'}</span>
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--muted-text)' }}>{displayUploader}</td>
                      <td style={{ padding: '12px 8px', color: 'var(--muted-text)' }}>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : (doc.date !== 'Unknown' ? doc.date : 'Unknown')}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14}/> Indexed</span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <button title="Force Delete Document & Vectors" className="action-icon delete-btn" onClick={() => forceDeleteDocument(doc.name)} disabled={loading}>
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0' }}>Data Loss Prevention (DLP)</h3>
              <p style={{ margin: 0, color: 'var(--muted-text)', fontSize: '0.85rem' }}>ML anomaly detection and automatic account suspension.</p>
            </div>
            <button 
              onClick={toggleAutoSuspend}
              style={{ background: autoSuspendEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: autoSuspendEnabled ? '#22c55e' : 'var(--text-color)', border: `1px solid ${autoSuspendEnabled ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`, padding: '8px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {autoSuspendEnabled ? <Pause size={16}/> : <Play size={16}/>}
              {autoSuspendEnabled ? 'Auto-Suspend Active' : 'Enable Auto-Suspend'}
            </button>
          </div>
          
          <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--muted-text)' }}>
                  <th style={{ padding: '12px 8px' }}>Time</th>
                  <th style={{ padding: '12px 8px' }}>User ID</th>
                  <th style={{ padding: '12px 8px' }}>Severity</th>
                  <th style={{ padding: '12px 8px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {securityAlerts.length === 0 ? (
                  <tr><td colSpan="4" style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--muted-text)' }}>No security alerts detected.</td></tr>
                ) : securityAlerts.map((alert, i) => (
                  <tr key={alert.id} className="admin-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', animation: `slideIn 0.2s ease ${i * 0.02}s forwards`, opacity: 0 }}>
                    <td style={{ padding: '12px 8px' }}>{new Date(alert.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--muted-text)' }}>{alert.user_id?.slice(0,8)}...</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: 8 }}>{alert.severity}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>{alert.details?.message || alert.alert_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="date" value={logStartDate} onChange={e => setLogStartDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-color)', padding: '0 16px', borderRadius: 8, fontSize: '0.85rem', height: 36, boxSizing: 'border-box' }} />
              <span style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>to</span>
              <input type="date" value={logEndDate} onChange={e => setLogEndDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-color)', padding: '0 16px', borderRadius: 8, fontSize: '0.85rem', height: 36, boxSizing: 'border-box' }} />
            </div>
            
            <CustomDropdown 
              value={logActionType} 
              options={[
                { value: 'all', label: 'All Actions' },
                { value: 'chat_query', label: 'Chat Queries' },
                { value: 'ghost_query', label: 'Ghost Queries' },
                { value: 'upload_document', label: 'Uploads' },
                { value: 'delete_document', label: 'Deletions' },
                { value: 'login_logout', label: 'Logins / Logouts' },
                { value: 'ghost_mode', label: 'Ghost Mode (On/Off)' },
              ]} 
              onChange={setLogActionType} 
            />

            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 16px', flex: 1, minWidth: 260, height: 36, boxSizing: 'border-box' }}>
              <Search size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
              <input type="text" placeholder="Search logs by user, ID, domain, date/time..." value={logSearchQuery} onChange={e => setLogSearchQuery(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.85rem', height: '100%' }} />
            </div>

            <div style={{ flex: 1 }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="number" min="1" value={logPurgeDays} onChange={e => setLogPurgeDays(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-color)', padding: '6px 12px', borderRadius: 8, fontSize: '0.85rem', width: 60 }} />
              <span style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>days</span>
              <button className="tab-btn" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} onClick={purgeLogs}><Trash2 size={14}/> Purge</button>
            </div>
            
            <button className="tab-btn" style={{ background: 'var(--accent-color)', color: '#fff' }} onClick={downloadCSV}><Download size={14}/> Export CSV</button>
          </div>

          <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--muted-text)' }}>
                  <th style={{ padding: '12px 8px' }}>Time</th>
                  <th style={{ padding: '12px 8px' }}>User</th>
                  <th style={{ padding: '12px 8px' }}>Domain</th>
                  <th style={{ padding: '12px 8px' }}>Action</th>
                  <th style={{ padding: '12px 8px' }}>Details</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--muted-text)' }}>No logs found for this filter.</td></tr>
                ) : filteredLogs.map((l, i) => {
                  const logUser = users.find(u => u.user_id === l.user_id || u.email === l.user_id);
                  const displayId = logUser ? (logUser.employee_id || logUser.email || l.user_id) : l.user_id;
                  const displayUserCol = logUser ? `${logUser.full_name || ''} (${displayId})` : displayId;
                  const logDomain = l.domain || l.details?.domain || logUser?.role || 'Global';

                  // Action badge config
                  const actionBadgeMap = {
                    chat_query:           { label: 'Chat Query',        color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
                    ghost_query:          { label: 'Ghost Query',       color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
                    upload_document:      { label: 'Upload',            color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                    delete_document:      { label: 'Deletion',          color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
                    login:                { label: 'Login',             color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
                    logout:               { label: 'Logout',            color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
                    ghost_mode_on:        { label: 'Ghost Mode ON',     color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
                    ghost_mode_off:       { label: 'Ghost Mode OFF',    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                    knowledge_graph_view: { label: 'Graph View',        color: '#00d2ff', bg: 'rgba(0,210,255,0.12)' },
                    document_view:        { label: 'Document View',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
                  };
                  const badge = actionBadgeMap[l.action_type] || { label: l.action_type, color: 'var(--muted-text)', bg: 'rgba(255,255,255,0.05)' };

                  // Format details nicely
                  let detailStr = '';
                  if (l.details && typeof l.details === 'object') {
                    const d = l.details;
                    if (d.query) detailStr = `"${d.query.slice(0, 60)}${d.query.length > 60 ? '…' : ''}"`;
                    else if (d.filename) detailStr = d.filename;
                    else if (d.full_name) {
                      detailStr = `${d.full_name} (${d.role || 'user'})`;
                      if (d.status) detailStr += ` - Status: ${d.status.toUpperCase()}`;
                    }
                    else detailStr = JSON.stringify(d).slice(0, 80);
                  } else {
                    detailStr = l.resource_id || '—';
                  }

                  return (
                  <tr key={l.id} className="admin-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', animation: `slideIn 0.2s ease ${i * 0.02}s forwards`, opacity: 0 }}>
                    <td style={{ padding: '12px 8px', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--muted-text)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{displayUserCol}</td>
                    <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--primary-color)' }}>{logDomain}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ color: badge.color, background: badge.bg, padding: '3px 8px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--muted-text)', fontSize: '0.82rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailStr}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <button title="Delete Log Entry" className="action-icon delete-btn" onClick={() => deleteAuditLog(l.id)}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
