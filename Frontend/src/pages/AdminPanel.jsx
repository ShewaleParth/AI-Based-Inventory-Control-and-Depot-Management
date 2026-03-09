import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Users, Warehouse, Plus, Trash2, Shield, Copy,
  CheckCircle, XCircle, Clock, Send, Eye,
  UserPlus, AlertTriangle, Package, ArrowRightLeft, Key
} from 'lucide-react';
import axios from 'axios';
import { EMPLOYEE_ROLES, getRoleMeta } from '../utils/permissions';

const API_BASE = '/api';

const AdminPanel = () => {
  const { token, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [depots, setDepots] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [stockRequests, setStockRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create Employee Form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: '', last_name: '', email: '', password: '', depotId: '', role: 'staff'
  });

  // Credentials display after creation
  const [createdCredentials, setCreatedCredentials] = useState(null);

  // Assignment Form State
  const [assignForm, setAssignForm] = useState({ userId: '', depotId: '' });
  const [showAssignForm, setShowAssignForm] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, depotRes, assignRes, reqRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/employees`, { headers }),
        axios.get(`${API_BASE}/depots`, { headers }),
        axios.get(`${API_BASE}/admin/depot-assignments`, { headers }),
        axios.get(`${API_BASE}/admin/stock-requests`, { headers })
      ]);
      setEmployees(empRes.data.employees || []);
      setDepots(depotRes.data.depots || []);
      setAssignments(assignRes.data.assignments || []);
      setStockRequests(reqRes.data.requests || []);
    } catch (err) {
      setError('Failed to load admin data');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showMessage = (msg, type = 'success') => {
    if (type === 'error') { setError(msg); setTimeout(() => setError(''), 5000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 5000); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showMessage('Copied to clipboard!');
    }).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showMessage('Copied to clipboard!');
    });
  };

  // ============ CREATE EMPLOYEE ============
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/admin/employees/invite`, createForm, { headers });
      setCreatedCredentials(res.data.credentials);
      setShowCreateForm(false);
      setCreateForm({ first_name: '', last_name: '', email: '', password: '', depotId: '' });
      fetchData();
      showMessage(res.data.message);
    } catch (err) {
      showMessage(err.response?.data?.message || 'Failed to create employee', 'error');
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!window.confirm('Are you sure you want to remove this employee? This will also revoke all their depot access.')) return;
    try {
      await axios.delete(`${API_BASE}/admin/employees/${id}`, { headers });
      showMessage('Employee removed');
      fetchData();
    } catch (err) {
      showMessage(err.response?.data?.message || 'Failed to remove employee', 'error');
    }
  };

  // ============ DEPOT ASSIGNMENTS ============
  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/admin/depot-assignments`, assignForm, { headers });
      showMessage(res.data.message);
      setShowAssignForm(false);
      setAssignForm({ userId: '', depotId: '' });
      fetchData();
    } catch (err) {
      showMessage(err.response?.data?.message || 'Failed to assign depot', 'error');
    }
  };

  const handleRemoveAssignment = async (id) => {
    try {
      await axios.delete(`${API_BASE}/admin/depot-assignments/${id}`, { headers });
      showMessage('Assignment removed');
      fetchData();
    } catch (err) {
      showMessage(err.response?.data?.message || 'Failed to remove assignment', 'error');
    }
  };

  // ============ STOCK REQUESTS ============
  const handleReviewRequest = async (id, status, reviewNotes = '') => {
    try {
      const res = await axios.patch(`${API_BASE}/admin/stock-requests/${id}`, { status, reviewNotes }, { headers });
      showMessage(res.data.message);
      fetchData();
    } catch (err) {
      showMessage(err.response?.data?.message || 'Failed to review request', 'error');
    }
  };

  if (!isAdmin()) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <AlertTriangle size={48} style={{ color: 'var(--warning)', marginBottom: '1rem' }} />
        <h2>Access Denied</h2>
        <p>Only administrators can access this panel.</p>
      </div>
    );
  }

  const pendingRequests = stockRequests.filter(r => r.status === 'pending');

  const inputStyle = {
    padding: '0.6rem 0.75rem', borderRadius: '8px',
    border: '1px solid var(--border-color, #ddd)', fontSize: '0.9rem',
    width: '100%', boxSizing: 'border-box'
  };

  return (
    <div className="admin-panel" style={{ padding: '0' }}>
      {/* Messages */}
      {error && (
        <div style={{
          background: 'var(--danger, #dc3545)', color: 'white', padding: '0.75rem 1rem',
          borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      {success && (
        <div style={{
          background: 'var(--success, #28a745)', color: 'white', padding: '0.75rem 1rem',
          borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {/* ====== CREDENTIALS POPUP ====== */}
      {createdCredentials && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white',
          borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem',
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)', position: 'relative'
        }}>
          <button onClick={() => setCreatedCredentials(null)} style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
            width: '28px', height: '28px', cursor: 'pointer', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem'
          }}>×</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Key size={24} />
            <h3 style={{ margin: 0 }}>Employee Login Credentials</h3>
          </div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', opacity: 0.9 }}>
            Share these credentials with your employee so they can log in:
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '0.75rem 1rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', opacity: 0.7, display: 'block' }}>Email (Login ID)</span>
                <strong style={{ fontSize: '1.1rem', letterSpacing: '0.3px' }}>{createdCredentials.email}</strong>
              </div>
              <button onClick={() => copyToClipboard(createdCredentials.email)} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '6px',
                padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'white',
                display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem'
              }}><Copy size={14} /> Copy</button>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '0.75rem 1rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', opacity: 0.7, display: 'block' }}>Password</span>
                <strong style={{ fontSize: '1.1rem', letterSpacing: '0.5px' }}>{createdCredentials.password}</strong>
              </div>
              <button onClick={() => copyToClipboard(createdCredentials.password)} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '6px',
                padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'white',
                display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem'
              }}><Copy size={14} /> Copy</button>
            </div>
          </div>

          <button onClick={() => {
            copyToClipboard(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`);
          }} style={{
            marginTop: '1rem', background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', color: 'white',
            fontWeight: '500', width: '100%', fontSize: '0.9rem'
          }}>
            <Copy size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} /> Copy All Credentials
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1.5rem',
        borderBottom: '1px solid var(--border-color, #e0e0e0)', paddingBottom: '0.5rem',
        flexWrap: 'wrap'
      }}>
        {[
          { id: 'employees', icon: Users, label: 'Employees', count: employees.length },
          { id: 'assignments', icon: Warehouse, label: 'Depot Assignments', count: assignments.length },
          { id: 'requests', icon: ArrowRightLeft, label: 'Stock Requests', count: pendingRequests.length }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--primary, #6366f1)' : 'var(--card-bg, #f5f5f5)',
            color: activeTab === tab.id ? 'white' : 'var(--text-primary, #333)',
            fontWeight: activeTab === tab.id ? '600' : '400',
            transition: 'all 0.2s ease', fontSize: '0.9rem'
          }}>
            <tab.icon size={16} /> {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? 'rgba(255,255,255,0.3)' : 'var(--primary, #6366f1)',
                color: 'white', borderRadius: '10px', padding: '0 0.5rem', fontSize: '0.75rem', fontWeight: '600'
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Loading...</p>}

      {/* ============ EMPLOYEES TAB ============ */}
      {activeTab === 'employees' && !loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Team Members</h3>
            <button onClick={() => { setShowCreateForm(!showCreateForm); setCreatedCredentials(null); }} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: 'var(--primary, #6366f1)', color: 'white', fontWeight: '500'
            }}>
              <UserPlus size={16} /> Create Employee
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreate} style={{
              background: 'var(--card-bg, #f8f9fa)', borderRadius: '12px',
              padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-color, #e0e0e0)'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <UserPlus size={18} /> Create Employee Account
              </h4>
              <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
                Create login credentials and optionally assign a depot. You'll see the credentials after creation to share with the employee.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>First Name *</label>
                  <input placeholder="e.g. Rahul" required value={createForm.first_name}
                    onChange={e => setCreateForm({ ...createForm, first_name: e.target.value })}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>Last Name *</label>
                  <input placeholder="e.g. Sharma" required value={createForm.last_name}
                    onChange={e => setCreateForm({ ...createForm, last_name: e.target.value })}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>Email (Login ID) *</label>
                  <input type="email" placeholder="e.g. rahul@company.com" required value={createForm.email}
                    onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>Password *</label>
                  <input type="text" placeholder="Set a password (min 6 chars)" required
                    minLength={6} value={createForm.password}
                    onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>Assign Depot</label>
                  <select value={createForm.depotId}
                    onChange={e => setCreateForm({ ...createForm, depotId: e.target.value })}
                    style={inputStyle}>
                    <option value="">No depot (assign later)</option>
                    {depots.map(d => (
                      <option key={d.id} value={d.id}>{d.name} — {d.location}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>Role *</label>
                  <select value={createForm.role}
                    onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                    style={inputStyle}>
                    {EMPLOYEE_ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
                <button type="submit" style={{
                  padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: 'var(--primary, #6366f1)', color: 'white', fontWeight: '600', fontSize: '0.9rem'
                }}>
                  <UserPlus size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} /> Create & Get Credentials
                </button>
                <button type="button" onClick={() => setShowCreateForm(false)} style={{
                  padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border-color, #ddd)',
                  cursor: 'pointer', background: 'transparent', color: 'var(--text-primary, #333)', fontSize: '0.9rem'
                }}>Cancel</button>
              </div>
            </form>
          )}

          {employees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
              <Users size={48} style={{ marginBottom: '1rem' }} />
              <p>No employees yet. Create your first team member!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {employees.map(emp => (
                <div key={emp.id} style={{
                  background: 'var(--card-bg, #fff)', borderRadius: '12px', padding: '1rem 1.25rem',
                  border: '1px solid var(--border-color, #e0e0e0)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: '0.75rem'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '1rem' }}>{emp.name}</strong>
                      <span style={{
                        background: `${getRoleMeta(emp.role).color}22`,
                        color: getRoleMeta(emp.role).color,
                        border: `1px solid ${getRoleMeta(emp.role).color}44`,
                        borderRadius: '4px', padding: '0.1rem 0.5rem', fontSize: '0.71rem',
                        textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.3px'
                      }}>{getRoleMeta(emp.role).label}</span>
                    </div>
                    <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>{emp.email}</p>
                    {emp.assignedDepots?.length > 0 ? (
                      <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                        {emp.assignedDepots.map((d, i) => (
                          <span key={i} style={{
                            background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)',
                            borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: '500'
                          }}>
                            <Warehouse size={10} style={{ marginRight: '0.2rem' }} />{d.depotName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #999)', marginTop: '0.3rem', display: 'block' }}>
                        No depot assigned — read-only access
                      </span>
                    )}
                  </div>
                  <button onClick={() => handleDeleteEmployee(emp.id)} title="Remove employee" style={{
                    padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--danger, #dc3545)',
                    cursor: 'pointer', background: 'transparent', color: 'var(--danger, #dc3545)'
                  }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ DEPOT ASSIGNMENTS TAB ============ */}
      {activeTab === 'assignments' && !loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Depot Assignments</h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
                Assign additional depots to existing employees or manage their access
              </p>
            </div>
            <button onClick={() => setShowAssignForm(!showAssignForm)} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: 'var(--primary, #6366f1)', color: 'white', fontWeight: '500'
            }}>
              <Plus size={16} /> Assign Depot
            </button>
          </div>

          {showAssignForm && (
            <form onSubmit={handleAssign} style={{
              background: 'var(--card-bg, #f8f9fa)', borderRadius: '12px',
              padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid var(--border-color, #e0e0e0)'
            }}>
              <h4 style={{ margin: '0 0 1rem 0' }}>Assign Depot to Employee</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>Employee</label>
                  <select required value={assignForm.userId}
                    onChange={e => setAssignForm({ ...assignForm, userId: e.target.value })}
                    style={inputStyle}>
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem', display: 'block', color: 'var(--text-secondary, #555)' }}>Depot</label>
                  <select required value={assignForm.depotId}
                    onChange={e => setAssignForm({ ...assignForm, depotId: e.target.value })}
                    style={inputStyle}>
                    <option value="">Select Depot</option>
                    {depots.map(d => (
                      <option key={d.id} value={d.id}>{d.name} — {d.location}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="submit" style={{
                  padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: 'var(--primary, #6366f1)', color: 'white', fontWeight: '500'
                }}>Assign</button>
                <button type="button" onClick={() => setShowAssignForm(false)} style={{
                  padding: '0.5rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border-color, #ddd)',
                  cursor: 'pointer', background: 'transparent', color: 'var(--text-primary, #333)'
                }}>Cancel</button>
              </div>
            </form>
          )}

          {assignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
              <Warehouse size={48} style={{ marginBottom: '1rem' }} />
              <p>No depot assignments yet. Assign a depot to an employee to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {assignments.map(a => (
                <div key={a.id} style={{
                  background: 'var(--card-bg, #fff)', borderRadius: '12px', padding: '1rem 1.25rem',
                  border: '1px solid var(--border-color, #e0e0e0)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div>
                      <strong>{a.employee?.name || 'Unknown'}</strong>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>
                        {a.employee?.email}
                      </p>
                    </div>
                    <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary, #999)' }}>→</span>
                    <div>
                      <strong style={{ color: 'var(--primary, #6366f1)' }}>{a.depot?.name || 'Unknown'}</strong>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>
                        {a.depot?.location}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleRemoveAssignment(a.id)} title="Remove assignment" style={{
                    padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--danger, #dc3545)',
                    cursor: 'pointer', background: 'transparent', color: 'var(--danger, #dc3545)'
                  }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ STOCK REQUESTS TAB ============ */}
      {activeTab === 'requests' && !loading && (
        <div>
          <h3 style={{ margin: '0 0 1rem 0' }}>Stock Requests</h3>

          {stockRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
              <ArrowRightLeft size={48} style={{ marginBottom: '1rem' }} />
              <p>No stock requests yet.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {stockRequests.map(req => (
                <div key={req.id} style={{
                  background: 'var(--card-bg, #fff)', borderRadius: '12px', padding: '1rem 1.25rem',
                  border: `1px solid ${req.status === 'pending' ? 'var(--warning, #f59e0b)' :
                    req.status === 'approved' ? 'var(--success, #16a34a)' : 'var(--danger, #dc3545)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                        <Package size={16} style={{ color: 'var(--primary, #6366f1)' }} />
                        <strong>{req.product?.name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>({req.product?.sku})</span>
                      </div>
                      <p style={{ margin: '0.2rem 0', fontSize: '0.9rem' }}>
                        <strong>{req.quantity}</strong> units: {req.fromDepot?.name} → {req.toDepot?.name}
                      </p>
                      <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>
                        Requested by <strong>{req.requestedBy?.name}</strong>
                        {req.reason && ` — "${req.reason}"`}
                      </p>
                      <p style={{ margin: '0.2rem 0', fontSize: '0.75rem', color: 'var(--text-secondary, #999)' }}>
                        {new Date(req.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {req.status === 'pending' ? (
                        <>
                          <button onClick={() => handleReviewRequest(req.id, 'approved')} style={{
                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            background: 'var(--success, #16a34a)', color: 'white', fontSize: '0.85rem', fontWeight: '500'
                          }}><CheckCircle size={14} /> Approve</button>
                          <button onClick={() => handleReviewRequest(req.id, 'rejected')} style={{
                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            background: 'var(--danger, #dc3545)', color: 'white', fontSize: '0.85rem', fontWeight: '500'
                          }}><XCircle size={14} /> Reject</button>
                        </>
                      ) : (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: '0.3rem',
                          padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600',
                          background: req.status === 'approved' ? 'var(--success-light, #dcfce7)' : 'var(--danger-light, #fee2e2)',
                          color: req.status === 'approved' ? 'var(--success, #16a34a)' : 'var(--danger, #dc3545)'
                        }}>
                          {req.status === 'approved' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
