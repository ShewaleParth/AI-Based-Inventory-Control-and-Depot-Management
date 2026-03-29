import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Warehouse, MapPin, AlertTriangle, CheckCircle, Zap,
  Package, BarChart3, RefreshCw, Layers, Info, X,
  Navigation, Eye, ExternalLink
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';

// ─── Fix Leaflet default icon paths broken by Vite bundling ───────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Custom SVG marker factory ─────────────────────────────────────────────────
const createDepotIcon = (utilization, isSelected = false) => {
  let color, glowColor, ringColor;
  if (utilization > 85) {
    color = '#ef4444'; glowColor = 'rgba(239,68,68,0.5)'; ringColor = '#dc2626';
  } else if (utilization > 60) {
    color = '#f59e0b'; glowColor = 'rgba(245,158,11,0.5)'; ringColor = '#d97706';
  } else {
    color = '#10b981'; glowColor = 'rgba(16,185,129,0.5)'; ringColor = '#059669';
  }

  const size = isSelected ? 48 : 38;
  const innerSize = isSelected ? 28 : 22;
  const ringWidth = isSelected ? 4 : 3;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size + 16}" height="${size + 20}" viewBox="0 0 ${size + 16} ${size + 20}">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="${isSelected ? 6 : 3}" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:#1e1b4b"/>
          <stop offset="100%" style="stop-color:#0f0e1a"/>
        </radialGradient>
      </defs>
      <!-- Outer glow ring -->
      <circle cx="${(size + 16) / 2}" cy="${size / 2 + 8}" r="${size / 2 + 2}" 
              fill="none" stroke="${glowColor}" stroke-width="${ringWidth + 2}" opacity="0.4" filter="url(#glow)"/>
      <!-- Main circle background -->
      <circle cx="${(size + 16) / 2}" cy="${size / 2 + 8}" r="${size / 2}" 
              fill="url(#bg)" stroke="${ringColor}" stroke-width="${ringWidth}" filter="${isSelected ? 'url(#glow)' : 'none'}"/>
      <!-- Inner colour indicator -->
      <circle cx="${(size + 16) / 2}" cy="${size / 2 + 8}" r="${innerSize / 2}" fill="${color}" opacity="0.9"/>
      <!-- Warehouse icon (simplified) -->
      <text x="${(size + 16) / 2}" y="${size / 2 + 13}" text-anchor="middle" 
            font-size="${isSelected ? 16 : 12}" fill="white" font-weight="bold">🏭</text>
      <!-- Tail pointer -->
      <polygon points="${(size + 16) / 2 - 6},${size + 6} ${(size + 16) / 2 + 6},${size + 6} ${(size + 16) / 2},${size + 18}" 
               fill="${ringColor}" opacity="0.9"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size + 16, size + 20],
    iconAnchor: [(size + 16) / 2, size + 18],
    popupAnchor: [0, -(size + 18)],
  });
};

// ─── Geocode a location string via Nominatim (OSM, free, no key) ──────────────
const geocodeLocation = async (locationStr) => {
  try {
    const encoded = encodeURIComponent(locationStr + ', India');
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch { /* fail silently */ }
  return null;
};

// ─── Auto-fit map to all markers ──────────────────────────────────────────────
const FitBounds = ({ depots }) => {
  const map = useMap();
  useEffect(() => {
    const valid = depots.filter(d => d.lat && d.lng);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 8);
      return;
    }
    const bounds = L.latLngBounds(valid.map(d => [d.lat, d.lng]));
    map.fitBounds(bounds, { padding: [60, 60] });
  }, [depots, map]);
  return null;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const DepotMap = () => {
  const { isAdmin, canWriteDepot } = useAuth();
  const { setActiveItem } = useNavigation();
  const [depots, setDepots] = useState([]);
  const [resolvedDepots, setResolvedDepots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState(null);
  const [mapStyle, setMapStyle] = useState('dark');
  const [showLegend, setShowLegend] = useState(true);
  const [savingCoords, setSavingCoords] = useState(null);
  const [toast, setToast] = useState(null);
  const geocodingDone = useRef(false);

  const tileProviders = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
      label: 'Dark'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
      label: 'Satellite'
    },
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      label: 'Street'
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch depots from backend
  const fetchDepots = async () => {
    setLoading(true);
    geocodingDone.current = false;
    try {
      const response = await api.getDepots();
      if (response?.depots) {
        setDepots(response.depots);
      }
    } catch (err) {
      console.error('Failed to fetch depots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDepots(); }, []);

  // Geocode depots that lack lat/lng, then auto-save back to DB
  useEffect(() => {
    if (loading || geocodingDone.current || depots.length === 0) return;
    geocodingDone.current = true;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const resolve = async () => {
      setGeocoding(true);

      const resolved = [];
      for (const depot of depots) {
        // Already has saved coordinates — skip geocoding
        if (depot.lat && depot.lng) {
          resolved.push(depot);
          continue;
        }

        // Respect Nominatim's 1-req/sec rate limit
        await sleep(300);
        const coords = await geocodeLocation(depot.location);

        if (coords) {
          // Small jitter prevents overlapping pins for same-city depots
          const lat = coords.lat + (Math.random() - 0.5) * 0.04;
          const lng = coords.lng + (Math.random() - 0.5) * 0.04;

          // ✅ Auto-save geocoded coordinates to DB so next load is instant
          try {
            await api.updateDepotCoordinates(depot.id, lat, lng);
          } catch {
            // Non-critical — map still works even if save fails
          }

          resolved.push({ ...depot, lat, lng, _geocoded: true });
        } else {
          // Geocoding failed — use random India position but DON'T save it
          // User should drag the pin to fix it
          resolved.push({
            ...depot,
            lat: 20.5937 + (Math.random() - 0.5) * 8,
            lng: 78.9629 + (Math.random() - 0.5) * 8,
            _geocoded: true,
            _fallback: true,
          });
        }
      }

      setResolvedDepots(resolved);
      setGeocoding(false);
    };

    resolve();
  }, [depots, loading]);

  // Save dragged-pin coordinates to DB
  const handleMarkerDragEnd = useCallback(async (depot, e) => {
    if (!isAdmin() && !canWriteDepot(depot.id)) return;
    const { lat, lng } = e.target.getLatLng();
    setSavingCoords(depot.id);
    try {
      await api.updateDepotCoordinates(depot.id, lat, lng);
      setResolvedDepots(prev =>
        prev.map(d => d.id === depot.id ? { ...d, lat, lng, _geocoded: false } : d)
      );
      showToast(`📍 ${depot.name} pinned successfully`);
    } catch {
      showToast('Failed to save position', 'error');
    } finally {
      setSavingCoords(null);
    }
  }, [isAdmin, canWriteDepot]);

  const getUtilization = (depot) =>
    Math.round((depot.currentUtilization / depot.capacity) * 100) || 0;

  const getStatusLabel = (u) => {
    if (u > 85) return { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    if (u > 60) return { label: 'Warning', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    return { label: 'Healthy', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
  };

  // Summary stats
  const criticalCount = resolvedDepots.filter(d => getUtilization(d) > 85).length;
  const warningCount  = resolvedDepots.filter(d => getUtilization(d) > 60 && getUtilization(d) <= 85).length;
  const healthyCount  = resolvedDepots.filter(d => getUtilization(d) <= 60).length;
  const avgUtil = resolvedDepots.length
    ? Math.round(resolvedDepots.reduce((a, d) => a + getUtilization(d), 0) / resolvedDepots.length)
    : 0;

  const canDrag = (depot) => isAdmin() || canWriteDepot(depot.id);

  if (loading) {
    return (
      <div className="depot-map-loading">
        <div className="map-loading-inner">
          <div className="map-spinner" />
          <p>Loading depot network...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="depot-map-page">
      {/* ─── Toast ─────────────────────────────────────────── */}
      {toast && (
        <div className={`map-toast ${toast.type === 'error' ? 'map-toast-error' : ''}`}>
          {toast.msg}
        </div>
      )}

      {/* ─── Page Header ───────────────────────────────────── */}
      <div className="depot-map-header">
        <div className="depot-map-title-row">
          <div className="depot-map-title-block">
            <div className="depot-map-icon-wrap">
              <Navigation size={22} />
            </div>
            <div>
              <h1>Depot Network Map</h1>
              <p>Live geo-visualization of all storage nodes</p>
            </div>
          </div>
          <div className="depot-map-header-actions">
            {geocoding && (
              <span className="geocoding-badge">
                <RefreshCw size={12} className="spin-icon" /> Geocoding locations...
              </span>
            )}
            {/* Map Style Toggle */}
            <div className="map-style-toggle">
              {Object.entries(tileProviders).map(([key, val]) => (
                <button
                  key={key}
                  className={`map-style-btn ${mapStyle === key ? 'active' : ''}`}
                  onClick={() => setMapStyle(key)}
                >
                  <Layers size={13} /> {val.label}
                </button>
              ))}
            </div>
            <button
              className="map-legend-btn"
              onClick={() => setShowLegend(v => !v)}
              title="Toggle legend"
            >
              <Info size={16} />
            </button>
            <button className="map-refresh-btn" onClick={fetchDepots} title="Refresh depots">
              <RefreshCw size={16} className={loading ? 'spin-icon' : ''} />
            </button>
          </div>
        </div>

        {/* ─── Summary KPI Strip ─────────────────────────── */}
        <div className="depot-map-kpi-row">
          <div className="map-kpi-card">
            <Warehouse size={18} />
            <div>
              <span className="map-kpi-val">{resolvedDepots.length}</span>
              <span className="map-kpi-label">Total Depots</span>
            </div>
          </div>
          <div className="map-kpi-card kpi-healthy">
            <CheckCircle size={18} />
            <div>
              <span className="map-kpi-val">{healthyCount}</span>
              <span className="map-kpi-label">Healthy</span>
            </div>
          </div>
          <div className="map-kpi-card kpi-warning">
            <Zap size={18} />
            <div>
              <span className="map-kpi-val">{warningCount}</span>
              <span className="map-kpi-label">Warning</span>
            </div>
          </div>
          <div className="map-kpi-card kpi-critical">
            <AlertTriangle size={18} />
            <div>
              <span className="map-kpi-val">{criticalCount}</span>
              <span className="map-kpi-label">Critical</span>
            </div>
          </div>
          <div className="map-kpi-card kpi-avg">
            <BarChart3 size={18} />
            <div>
              <span className="map-kpi-val">{avgUtil}%</span>
              <span className="map-kpi-label">Avg Utilization</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Map + Sidebar layout ──────────────────────────── */}
      <div className="depot-map-body">

        {/* ── Left: Map Canvas ─────────────────────────────── */}
        <div className="depot-map-canvas">
          <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              url={tileProviders[mapStyle].url}
              attribution={tileProviders[mapStyle].attribution}
              maxZoom={19}
            />
            <FitBounds depots={resolvedDepots} />

            {resolvedDepots.map((depot) => {
              const util = getUtilization(depot);
              const status = getStatusLabel(util);
              const isSelected = selectedDepot?.id === depot.id;
              const draggable = canDrag(depot);

              return (
                <Marker
                  key={depot.id}
                  position={[depot.lat, depot.lng]}
                  icon={createDepotIcon(util, isSelected)}
                  draggable={draggable}
                  eventHandlers={{
                    click: () => setSelectedDepot(isSelected ? null : depot),
                    dragend: (e) => handleMarkerDragEnd(depot, e),
                  }}
                >
                  <Popup className="depot-map-popup" maxWidth={280}>
                    <div className="popup-inner">
                      <div className="popup-header">
                        <div className="popup-title">
                          <Warehouse size={16} />
                          <strong>{depot.name}</strong>
                        </div>
                        <span
                          className="popup-status-badge"
                          style={{ color: status.color, background: status.bg }}
                        >
                          {status.label}
                        </span>
                      </div>

                      <div className="popup-location">
                        <MapPin size={12} />
                        <span>{depot.location}</span>
                        {depot._geocoded && (
                          <span className="approx-tag">~approx</span>
                        )}
                      </div>

                      <div className="popup-util-bar">
                        <div className="popup-util-labels">
                          <span>Utilization</span>
                          <span style={{ color: status.color }}>{util}%</span>
                        </div>
                        <div className="popup-bar-track">
                          <div
                            className="popup-bar-fill"
                            style={{ width: `${util}%`, background: status.color }}
                          />
                        </div>
                      </div>

                      <div className="popup-stats">
                        <div className="popup-stat">
                          <Package size={13} />
                          <span>{depot.itemsStored} SKUs stored</span>
                        </div>
                        <div className="popup-stat">
                          <BarChart3 size={13} />
                          <span>{depot.currentUtilization?.toLocaleString()} / {depot.capacity?.toLocaleString()} units</span>
                        </div>
                      </div>

                      {savingCoords === depot.id && (
                        <div className="popup-saving">
                          <RefreshCw size={12} className="spin-icon" /> Saving position...
                        </div>
                      )}

                      {draggable && (
                        <p className="popup-drag-hint">
                          <MapPin size={11} /> Drag marker to reposition
                        </p>
                      )}

                      <button
                        className="popup-details-btn"
                        onClick={() => setActiveItem('Depots')}
                      >
                        View Full Details <ExternalLink size={13} />
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Legend overlay */}
          {showLegend && (
            <div className="map-legend-overlay">
              <div className="legend-header">
                <span>Status Legend</span>
                <button onClick={() => setShowLegend(false)}><X size={12} /></button>
              </div>
              <div className="legend-item"><span className="legend-dot dot-healthy" /> Healthy (&le;60%)</div>
              <div className="legend-item"><span className="legend-dot dot-warning" /> Warning (61–85%)</div>
              <div className="legend-item"><span className="legend-dot dot-critical" /> Critical (&gt;85%)</div>
              {(isAdmin()) && (
                <div className="legend-drag-note">
                  <MapPin size={11} /> Drag pins to reposition
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Depot List Sidebar ─────────────────────── */}
        <div className="depot-map-sidebar">
          <div className="dms-header">
            <h3><Eye size={16} /> Depot Nodes</h3>
            <span className="dms-count">{resolvedDepots.length}</span>
          </div>

          <div className="dms-list">
            {resolvedDepots.map((depot) => {
              const util = getUtilization(depot);
              const status = getStatusLabel(util);
              const isActive = selectedDepot?.id === depot.id;

              return (
                <div
                  key={depot.id}
                  className={`dms-item ${isActive ? 'dms-item-active' : ''}`}
                  onClick={() => setSelectedDepot(isActive ? null : depot)}
                >
                  <div className="dms-dot" style={{ background: status.color }} />
                  <div className="dms-info">
                    <div className="dms-name">{depot.name}</div>
                    <div className="dms-location">
                      <MapPin size={11} /> {depot.location}
                    </div>
                    <div className="dms-bar-row">
                      <div className="dms-bar-track">
                        <div
                          className="dms-bar-fill"
                          style={{ width: `${util}%`, background: status.color }}
                        />
                      </div>
                      <span className="dms-util-pct" style={{ color: status.color }}>
                        {util}%
                      </span>
                    </div>
                  </div>
                  <div
                    className="dms-status-chip"
                    style={{ color: status.color, background: status.bg }}
                  >
                    {status.label}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="dms-goto-btn"
            onClick={() => setActiveItem('Depots')}
          >
            <Warehouse size={15} /> Manage Depots
          </button>
        </div>
      </div>
    </div>
  );
};

export default DepotMap;
