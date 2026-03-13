import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EVENTS as js_event } from '../../js/js_eventList.js';
import { js_eventEmitter } from '../../js/js_eventEmitter.js';
import { js_andruavAuth } from '../../js/js_andruav_auth.js';
import {
  fn_opsHealthSnapshot,
  fn_opsHealthClearHistory,
  fn_opsHealthAddEvent,
} from '../../js/js_ops_health.js';
import {
  fn_retryConnectionNow,
  fn_cancelConnectionRetry,
  fn_recoverAllTelemetry,
} from '../../js/js_main.js';
import {
  fn_missionIntegritySnapshot,
} from '../../js/js_mission_integrity.js';
import { js_websocket_bridge } from '../../js/CPC/js_websocket_bridge.js';

function fn_stateClass(state) {
  switch (state) {
    case 'connected':
    case 'ok':
    case 'active':
      return 'is-ok';

    case 'connecting':
    case 'retrying':
    case 'recovering':
    case 'degraded':
      return 'is-warn';

    case 'failed':
    case 'error':
    case 'inactive':
    case 'disconnected':
      return 'is-bad';

    default:
      return 'is-idle';
  }
}

function fn_levelClass(level) {
  switch (level) {
    case 'error':
      return 'is-error';
    case 'warn':
      return 'is-warn';
    default:
      return 'is-info';
  }
}

function fn_formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false });
  } catch {
    return '--:--:--';
  }
}

function fn_formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${Math.round(size)} B`;
}

function fn_formatAge(ts) {
  const time = Number(ts || 0);
  if (!Number.isFinite(time) || time <= 0) return '-';
  const ageMs = Math.max(0, Date.now() - time);
  const totalSec = Math.floor(ageMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function fn_policyClass(mode) {
  switch (mode) {
    case 'primary':
      return 'is-primary';
    case 'fallback':
      return 'is-fallback';
    case 'degraded':
      return 'is-degraded';
    default:
      return 'is-standby';
  }
}

function ClssOpsHealthPanel() {
  const fn_getInitialCollapsed = () => {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      return window.localStorage.getItem('nb-ops-health-collapsed') === '1';
    } catch {
      return false;
    }
  };

  const [snapshot, setSnapshot] = useState(() => fn_opsHealthSnapshot());
  const [busyRetry, setBusyRetry] = useState(false);
  const [busyRecover, setBusyRecover] = useState(false);
  const [busyCancel, setBusyCancel] = useState(false);
  const [busyBridge, setBusyBridge] = useState(false);
  const [selectedPartyID, setSelectedPartyID] = useState('all');
  const [isCollapsed, setIsCollapsed] = useState(fn_getInitialCollapsed);
  const [bridgeEnabled, setBridgeEnabled] = useState(js_websocket_bridge.fn_isEnabled() === true);
  const [bridgeConnected, setBridgeConnected] = useState(js_websocket_bridge.fn_isConnected() === true);
  const [bridgeStats, setBridgeStats] = useState(() => js_websocket_bridge.fn_getRuntimeStats());
  const policyWarnRef = useRef({ signature: '', at: 0 });

  const fn_syncBridgeState = () => {
    const stats = js_websocket_bridge.fn_getRuntimeStats();
    setBridgeEnabled(stats.enabled === true);
    setBridgeConnected(stats.connected === true);
    setBridgeStats(stats);
  };

  useEffect(() => {
    const listener = {
      id: 'ops-health-panel',
    };

    const onUpdate = (me, nextSnapshot) => {
      setSnapshot(nextSnapshot || fn_opsHealthSnapshot());
      fn_syncBridgeState();
    };

    js_eventEmitter.fn_subscribe(js_event.EE_opsHealthUpdated, listener, onUpdate);
    setSnapshot(fn_opsHealthSnapshot());
    fn_syncBridgeState();

    const bridgeSyncTimer = window.setInterval(() => {
      fn_syncBridgeState();
    }, 1000);

    return () => {
      js_eventEmitter.fn_unsubscribe(js_event.EE_opsHealthUpdated, listener);
      window.clearInterval(bridgeSyncTimer);
    };
  }, []);

  const canControl = js_andruavAuth.fn_do_canControl();
  const auth = snapshot?.global?.auth || {};
  const ws = snapshot?.global?.ws || {};
  const udp = snapshot?.global?.udp || {};
  const video = snapshot?.global?.video || {};
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  const units = useMemo(() => snapshot?.units || {}, [snapshot]);
  const unitRows = useMemo(() => {
    return Object.keys(units).map((partyID) => ({
      partyID,
      unitName: units[partyID]?.unitName || partyID,
      wsRetryCount: units[partyID]?.ws?.attempt || 0,
      wsRetryMax: units[partyID]?.ws?.maxAttempts || 0,
      udpRetryCount: units[partyID]?.udp?.retryCount || 0,
      udpRetryMax: units[partyID]?.udp?.retryMax || 0,
    }));
  }, [units]);

  const linkPolicy = useMemo(() => {
    const onlineUnits = Object.keys(units).map((partyID) => ({
      partyID,
      unitName: units[partyID]?.unitName || partyID,
      udpState: units[partyID]?.udp?.state || 'inactive',
      isFlying: units[partyID]?.flight?.flying === true,
    }));
    const onlineCount = onlineUnits.length;
    const flyingUnits = onlineUnits.filter((unit) => unit.isFlying === true);
    const fallbackFlyingUnits = flyingUnits.filter((unit) => unit.udpState !== 'active');
    const fallbackFlyingSignature = fallbackFlyingUnits.map((unit) => unit.partyID).sort().join('|');

    if (onlineCount === 0) {
      return {
        mode: 'standby',
        label: 'Standby',
        detail: 'No vehicles online',
        fallbackFlyingUnits: [],
        fallbackFlyingSignature: '',
      };
    }

    if (udp.state === 'active') {
      return {
        mode: 'primary',
        label: 'Primary: Smart Telemetry',
        detail: `${udp.activeUnits || 0}/${udp.totalUnits || onlineCount} units on UDP`,
        fallbackFlyingUnits,
        fallbackFlyingSignature,
      };
    }

    if (bridgeEnabled === true && bridgeConnected === true) {
      return {
        mode: 'fallback',
        label: 'Fallback: Bridge',
        detail: 'Smart Telemetry degraded/inactive. Bridge is carrying continuity.',
        fallbackFlyingUnits,
        fallbackFlyingSignature,
      };
    }

    return {
      mode: 'degraded',
      label: 'Degraded: Link Risk',
      detail: 'Smart Telemetry unavailable and Bridge not connected.',
      fallbackFlyingUnits,
      fallbackFlyingSignature,
    };
  }, [units, udp.state, udp.activeUnits, udp.totalUnits, bridgeEnabled, bridgeConnected]);

  useEffect(() => {
    if (linkPolicy.mode !== 'fallback' || !linkPolicy.fallbackFlyingSignature) {
      policyWarnRef.current.signature = '';
      return;
    }

    const now = Date.now();
    const names = linkPolicy.fallbackFlyingUnits.map((unit) => unit.unitName).join(', ');
    const signature = `${linkPolicy.mode}:${linkPolicy.fallbackFlyingSignature}`;
    const staleWarn = (now - Number(policyWarnRef.current.at || 0)) > 45000;
    const changed = policyWarnRef.current.signature !== signature;
    if (changed !== true && staleWarn !== true) {
      return;
    }

    policyWarnRef.current.signature = signature;
    policyWarnRef.current.at = now;
    fn_opsHealthAddEvent({
      source: 'policy',
      level: 'warn',
      message: `Bridge fallback active during flight for: ${names}. Use Smart Telemetry as primary link.`,
    });
  }, [linkPolicy.mode, linkPolicy.fallbackFlyingSignature, linkPolicy.fallbackFlyingUnits]);

  const filteredHistory = useMemo(() => {
    const rows = Array.isArray(snapshot?.history) ? snapshot.history : [];
    if (selectedPartyID === 'all') return rows;
    return rows.filter((entry) => String(entry.partyID || '') === String(selectedPartyID));
  }, [snapshot, selectedPartyID]);

  const chips = [
    {
      key: 'auth',
      title: 'Auth',
      state: auth.state || 'idle',
      detail: `${auth.detail || '-'} | role:${js_andruavAuth.fn_getRole()}`,
    },
    {
      key: 'ws',
      title: 'WS',
      state: ws.state || 'disconnected',
      detail: ws.detail || (ws.attempt ? `attempt ${ws.attempt}/${ws.maxAttempts || '?'}` : '-'),
    },
    {
      key: 'udp',
      title: 'UDP',
      state: udp.state || 'idle',
      detail: udp.detail || '-',
    },
    {
      key: 'video',
      title: 'Video',
      state: video.state || 'idle',
      detail: video.detail || '-',
    },
    {
      key: 'bridge',
      title: 'Bridge',
      state: bridgeEnabled ? (bridgeConnected ? 'connected' : 'connecting') : 'inactive',
      detail: bridgeEnabled
        ? (
          bridgeConnected
            ? `Q ${bridgeStats.queueDepth || 0}/${bridgeStats.queueCapacity || 0} | B ${fn_formatBytes(bridgeStats.socketBufferedBytes)}`
            : `Retry ${bridgeStats.reconnectAttempt || 0} | ${bridgeStats.lastReconnectReason || 'pending'}`
        )
        : 'Stopped by operator',
    },
  ];

  const onRetryWs = async () => {
    if (busyRetry) return;
    setBusyRetry(true);
    try {
      await fn_retryConnectionNow();
    } finally {
      setBusyRetry(false);
    }
  };

  const onRecoverUdp = () => {
    if (busyRecover) return;
    setBusyRecover(true);
    try {
      fn_recoverAllTelemetry();
    } finally {
      setTimeout(() => setBusyRecover(false), 300);
    }
  };

  const onCancelRetry = () => {
    if (busyCancel) return;
    setBusyCancel(true);
    try {
      fn_cancelConnectionRetry();
    } finally {
      setTimeout(() => setBusyCancel(false), 250);
    }
  };

  const onExportDiagnostics = () => {
    const missionSnapshot = fn_missionIntegritySnapshot();
    const traceId = history.find((entry) => !!entry.traceId)?.traceId || null;
    const bundle = {
      generatedAt: new Date().toISOString(),
      traceId: traceId,
      role: js_andruavAuth.fn_getRole(),
      filter: {
        partyID: selectedPartyID,
      },
      global: snapshot?.global || {},
      units: snapshot?.units || {},
      missionIntegrity: missionSnapshot?.units || {},
      history: filteredHistory,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const safeParty = selectedPartyID === 'all' ? 'all' : selectedPartyID;
    const filename = `nexus_diagnostics_${safeParty}_${Date.now()}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const onToggleBridge = () => {
    if (busyBridge) return;
    setBusyBridge(true);
    try {
      const enabled = js_websocket_bridge.fn_isEnabled() === true;
      if (enabled === true) {
        js_websocket_bridge.fn_uninit();
        fn_opsHealthAddEvent({
          source: 'bridge',
          level: 'warn',
          message: 'Telemetry bridge stopped by operator',
        });
      } else {
        js_websocket_bridge.fn_init();
        fn_opsHealthAddEvent({
          source: 'bridge',
          level: 'info',
          message: 'Telemetry bridge started by operator',
        });
      }
      fn_syncBridgeState();
    } finally {
      setTimeout(() => setBusyBridge(false), 250);
    }
  };

  const onToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('nb-ops-health-collapsed', next ? '1' : '0');
        }
      } catch {
        return next;
      }
      return next;
    });
  };

  return (
    <div className="ops-health-panel" id="ops_health_panel">
      <div className="ops-health-header">
        <span>Ops Health</span>
        <button
          type="button"
          className="btn btn-sm ops-health-collapse-btn"
          onClick={onToggleCollapse}
          aria-expanded={isCollapsed !== true}
          aria-label={isCollapsed ? 'Expand Ops Health panel' : 'Collapse Ops Health panel'}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <span className={`bi bi-chevron-down ops-health-collapse-icon ${isCollapsed ? 'is-collapsed' : ''}`} aria-hidden="true"></span>
        </button>
      </div>

      {isCollapsed !== true && (
        <>
          <div className={`ops-health-policy ${fn_policyClass(linkPolicy.mode)}`}>
            <div className="ops-health-policy__label">Link Policy</div>
            <div className="ops-health-policy__value">{linkPolicy.label}</div>
            <div className="ops-health-policy__detail">{linkPolicy.detail}</div>
            {linkPolicy.fallbackFlyingUnits.length > 0 && (
              <div className="ops-health-policy__warn">
                Flying on fallback: {linkPolicy.fallbackFlyingUnits.map((unit) => unit.unitName).join(', ')}
              </div>
            )}
          </div>

          <div className="ops-health-grid">
            {chips.map((chip) => (
              <div key={chip.key} className={`ops-health-chip ${fn_stateClass(chip.state)}`}>
                <div className="ops-health-chip-title">{chip.title}</div>
                <div className="ops-health-chip-state">{chip.state}</div>
                <div className="ops-health-chip-detail">{chip.detail}</div>
              </div>
            ))}
          </div>

          <div className="ops-health-actions">
            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onRetryWs}
              disabled={busyRetry}
              title="Force immediate reconnect"
            >
              {busyRetry ? 'Retrying...' : 'Retry WS'}
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onCancelRetry}
              disabled={busyCancel}
              title="Cancel pending reconnect attempts"
            >
              {busyCancel ? 'Canceling...' : 'Cancel Retry'}
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onRecoverUdp}
              disabled={busyRecover || canControl !== true}
              title={canControl === true ? 'Recover telemetry for all online vehicles' : 'Read-only: no control permission'}
            >
              {busyRecover ? 'Recovering...' : 'Recover UDP'}
            </button>

            <button
              type="button"
              className={`btn btn-sm ops-health-btn ops-health-btn-power ${bridgeEnabled ? 'is-on' : 'is-off'}`}
              onClick={onToggleBridge}
              disabled={busyBridge || canControl !== true}
              title={canControl === true ? 'Toggle local telemetry bridge forwarding' : 'Read-only: no control permission'}
            >
              <span className="bi bi-power" aria-hidden="true"></span>
              <span>{busyBridge ? 'Updating...' : (bridgeEnabled ? 'Stop Bridge' : 'Start Bridge')}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={() => fn_opsHealthClearHistory()}
              title="Clear panel history"
            >
              Clear History
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onExportDiagnostics}
              title="Export diagnostics bundle"
            >
              Export
            </button>
          </div>

          <div className="ops-health-bridge-metrics">
            <div className="ops-health-bridge-metrics-title">Bridge Runtime</div>
            <div className="ops-health-bridge-metrics-grid">
              <div className="ops-health-bridge-metric">
                <span>Queue</span>
                <strong>{bridgeStats.queueDepth || 0}/{bridgeStats.queueCapacity || 0}</strong>
              </div>
              <div className="ops-health-bridge-metric">
                <span>Buffered</span>
                <strong>{fn_formatBytes(bridgeStats.socketBufferedBytes)}</strong>
              </div>
              <div className="ops-health-bridge-metric">
                <span>TX</span>
                <strong>{Number(bridgeStats.txPackets || 0).toLocaleString()} / {fn_formatBytes(bridgeStats.txBytes)}</strong>
              </div>
              <div className="ops-health-bridge-metric">
                <span>RX</span>
                <strong>{Number(bridgeStats.rxPackets || 0).toLocaleString()} / {fn_formatBytes(bridgeStats.rxBytes)}</strong>
              </div>
              <div className="ops-health-bridge-metric">
                <span>Route</span>
                <strong>{Number(bridgeStats.routeDelivered || 0).toLocaleString()} ok | {Number(bridgeStats.routeDropped || 0).toLocaleString()} drop</strong>
              </div>
              <div className="ops-health-bridge-metric">
                <span>Drops</span>
                <strong>
                  BP {Number(bridgeStats.txDropBackpressure || 0).toLocaleString()} |
                  WS {Number(bridgeStats.txDropSocketUnavailable || 0).toLocaleString()} |
                  Q {Number(bridgeStats.queueDropsOverflow || 0).toLocaleString()}
                </strong>
              </div>
              <div className="ops-health-bridge-metric">
                <span>Reconnect</span>
                <strong>{Number(bridgeStats.reconnectAttempt || 0).toLocaleString()} / {Number(bridgeStats.reconnectScheduled || 0).toLocaleString()}</strong>
              </div>
              <div className="ops-health-bridge-metric">
                <span>Last Up/Down</span>
                <strong>{fn_formatAge(bridgeStats.lastConnectedAt)} / {fn_formatAge(bridgeStats.lastDisconnectedAt)}</strong>
              </div>
            </div>
          </div>

          <div className="ops-health-filters">
            <label htmlFor="ops_history_party_filter" className="ops-health-filter-label">Timeline</label>
            <select
              id="ops_history_party_filter"
              className="form-select form-select-sm ops-health-filter-select"
              value={selectedPartyID}
              onChange={(event) => setSelectedPartyID(event.target.value)}
            >
              <option value="all">All Units</option>
              {unitRows.map((row) => (
                <option key={row.partyID} value={row.partyID}>
                  {row.unitName}
                </option>
              ))}
            </select>
          </div>

          {unitRows.length > 0 && (
            <div className="ops-health-retry-list">
              {unitRows.map((row) => (
                <div key={`retry_${row.partyID}`} className="ops-health-retry-row">
                  <span className="ops-health-retry-name">{row.unitName}</span>
                  <span className="ops-health-retry-count">
                    WS {row.wsRetryCount}/{row.wsRetryMax || '?'} | UDP {row.udpRetryCount}/{row.udpRetryMax || '?'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="ops-health-history">
            {filteredHistory.length === 0 && (
              <div className="ops-health-history-empty">No recent events</div>
            )}

            {filteredHistory.map((entry) => (
              <div key={entry.id} className={`ops-health-history-row ${fn_levelClass(entry.level)}`}>
                <span className="ops-health-time">{fn_formatTime(entry.ts)}</span>
                <span className="ops-health-source">{entry.source}</span>
                <span className="ops-health-message">
                  {entry.partyID ? `[${entry.partyID}] ` : ''}
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ClssOpsHealthPanel;
