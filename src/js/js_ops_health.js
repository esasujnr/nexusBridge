import { js_globals } from './js_globals.js';
import * as js_andruavUnit from './js_andruavUnit.js';
import * as js_andruavMessages from './protocol/js_andruavMessages.js';
import { js_eventEmitter } from './js_eventEmitter.js';
import { EVENTS as js_event } from './js_eventList.js';
import { fn_uiAlertsAdd } from './js_ui_alerts.js';

const OPS_HISTORY_LIMIT = 20;
let v_eventSeq = 0;

function fn_now() {
    return Date.now();
}

function fn_defaultGlobal() {
    return {
        auth: { state: 'idle', detail: '', updatedAt: 0 },
        ws: { state: 'disconnected', detail: '', reasonCode: '', attempt: 0, maxAttempts: 0, updatedAt: 0 },
        udp: { state: 'idle', detail: 'No vehicles online', activeUnits: 0, totalUnits: 0, recoveringUnits: 0, inactiveUnits: 0, updatedAt: 0 },
        video: { state: 'idle', detail: '0/0 streaming', streamingUnits: 0, totalUnits: 0, updatedAt: 0 },
    };
}

function fn_defaultUnit(partyID) {
    return {
        partyID: partyID,
        unitName: partyID,
        ws: { state: 'disconnected', detail: '', updatedAt: 0 },
        udp: { state: 'inactive', detail: 'Inactive', active: false, paused: false, ip: null, port: 0, level: 0, recoveryState: 'idle', statusNote: '', retryCount: 0, retryMax: 0, updatedAt: 0 },
        video: { state: 'idle', streaming: false, updatedAt: 0 },
    };
}

function fn_defaultStore() {
    return {
        global: fn_defaultGlobal(),
        units: {},
        history: [],
    };
}

let v_store = fn_defaultStore();

function fn_cloneStore() {
    const clonedUnits = {};
    Object.keys(v_store.units).forEach((partyID) => {
        const unit = v_store.units[partyID];
        clonedUnits[partyID] = {
            ...unit,
            ws: { ...unit.ws },
            udp: { ...unit.udp },
            video: { ...unit.video },
        };
    });

    return {
        global: {
            auth: { ...v_store.global.auth },
            ws: { ...v_store.global.ws },
            udp: { ...v_store.global.udp },
            video: { ...v_store.global.video },
        },
        units: clonedUnits,
        history: v_store.history.map((entry) => ({ ...entry })),
    };
}

function fn_emitUpdate() {
    if (!js_event || !js_event.EE_opsHealthUpdated) return;
    js_eventEmitter.fn_dispatch(js_event.EE_opsHealthUpdated, fn_cloneStore());
}

function fn_mergeTimed(base, patch) {
    return {
        ...(base || {}),
        ...(patch || {}),
        updatedAt: fn_now(),
    };
}

function fn_ensureUnit(partyID) {
    if (!partyID) return null;
    if (!v_store.units[partyID]) {
        v_store.units[partyID] = fn_defaultUnit(partyID);
    }
    return v_store.units[partyID];
}

function fn_pushHistory(entry) {
    const ts = fn_now();
    const event = {
        id: `ops-${ts}-${++v_eventSeq}`,
        ts: ts,
        source: entry?.source || 'system',
        level: entry?.level || 'info',
        message: entry?.message || '',
        partyID: entry?.partyID || null,
        traceId: js_globals.v_connectTraceId || null,
    };
    v_store.history = [event, ...v_store.history].slice(0, OPS_HISTORY_LIMIT);

    // Forward warning/error lifecycle signals to Alert Center.
    if (event.level === 'warn' || event.level === 'error') {
        fn_uiAlertsAdd({
            ts: event.ts,
            level: event.level,
            source: event.source,
            message: event.message,
            partyID: event.partyID || '',
        });
    }
}

function fn_getOnlineVehicleUnits() {
    const list = js_globals?.m_andruavUnitList;
    if (!list || typeof list.fn_getUnitValues !== 'function') return [];
    const values = list.fn_getUnitValues() || [];
    return values.filter((unit) => (
        unit
        && unit.m_defined === true
        && unit.m_IsGCS !== true
        && unit.m_IsDisconnectedFromGCS !== true
        && unit.m_IsShutdown !== true
    ));
}

function fn_normalizeUdpState(telemetry) {
    const recoveryState = telemetry?.m_udpProxy_recovery_state || 'idle';
    const active = telemetry?.m_udpProxy_active === true;
    const paused = telemetry?.m_udpProxy_paused === true;
    const note = telemetry?.m_udpProxy_status_note || '';
    let state = 'inactive';
    if (recoveryState === 'recovering') {
        state = 'recovering';
    } else if (active !== true) {
        state = 'inactive';
    } else if (paused === true) {
        state = 'paused';
    } else {
        state = 'active';
    }

    let detail = note || 'Inactive';
    if (state === 'active' || state === 'paused') {
        detail = `${telemetry?.m_udpProxy_ip || '-'}:${telemetry?.m_udpProxy_port || 0}`;
    }
    if (state === 'paused') {
        detail = `${detail} (paused)`;
    }
    if (state === 'recovering') {
        detail = 'Recovering telemetry...';
    }
    return { state, detail };
}

function fn_isStreaming(unit) {
    if (!unit || !unit.m_Video || typeof unit.m_Video.fn_getVideoStreaming !== 'function') return false;
    return unit.m_Video.fn_getVideoStreaming() === js_andruavUnit.CONST_VIDEOSTREAMING_ON;
}

function fn_applyGlobalWsToUnit(unitState) {
    if (!unitState) return;
    unitState.ws = fn_mergeTimed(unitState.ws, {
        state: v_store.global.ws.state || 'disconnected',
        detail: v_store.global.ws.detail || '',
        reasonCode: v_store.global.ws.reasonCode || '',
        attempt: v_store.global.ws.attempt || 0,
        maxAttempts: v_store.global.ws.maxAttempts || 0,
    });
}

export function fn_opsHealthSnapshot() {
    return fn_cloneStore();
}

export function fn_opsHealthAddEvent(entry) {
    fn_pushHistory(entry);
    fn_emitUpdate();
}

export function fn_opsHealthClearHistory() {
    v_store.history = [];
    fn_emitUpdate();
}

export function fn_opsHealthReset() {
    v_store = fn_defaultStore();
    fn_emitUpdate();
}

export function fn_opsHealthUpdateGlobal(partial) {
    if (!partial || typeof partial !== 'object') return;
    Object.keys(partial).forEach((key) => {
        if (!v_store.global[key]) {
            v_store.global[key] = {};
        }
        v_store.global[key] = fn_mergeTimed(v_store.global[key], partial[key]);
    });
    if (partial.ws) {
        Object.keys(v_store.units).forEach((partyID) => {
            fn_applyGlobalWsToUnit(v_store.units[partyID]);
        });
    }
    fn_emitUpdate();
}

export function fn_opsHealthUpdateUnit(partyID, partial) {
    const unit = fn_ensureUnit(partyID);
    if (!unit || !partial || typeof partial !== 'object') return;
    Object.keys(partial).forEach((key) => {
        if (key === 'unitName') {
            unit.unitName = partial[key] || unit.unitName;
            return;
        }
        if (!unit[key]) {
            unit[key] = {};
        }
        unit[key] = fn_mergeTimed(unit[key], partial[key]);
    });
    fn_emitUpdate();
}

export function fn_opsHealthRemoveUnit(partyID) {
    if (!partyID || !v_store.units[partyID]) return;
    delete v_store.units[partyID];
    fn_emitUpdate();
}

export function fn_opsHealthSetWsState(state, detail = '', attempt = 0, maxAttempts = 0, reasonCode = '', eventMeta = null) {
    v_store.global.ws = fn_mergeTimed(v_store.global.ws, {
        state: state || 'unknown',
        detail: detail || '',
        reasonCode: reasonCode || '',
        attempt: Number.isFinite(attempt) ? attempt : 0,
        maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : 0,
    });

    Object.keys(v_store.units).forEach((partyID) => {
        fn_applyGlobalWsToUnit(v_store.units[partyID]);
    });

    if (eventMeta && eventMeta.message) {
        fn_pushHistory({
            source: eventMeta.source || 'ws',
            level: eventMeta.level || 'info',
            message: eventMeta.message,
            partyID: eventMeta.partyID || null,
        });
    }
    fn_emitUpdate();
}

export function fn_opsHealthHandleSocketStatus(event = {}) {
    const status = event.status;
    const attempt = Number.isFinite(event.attempt) ? event.attempt : (v_store.global.ws.attempt || 0);
    const maxAttempts = Number.isFinite(event.maxAttempts) ? event.maxAttempts : (v_store.global.ws.maxAttempts || 0);
    const reason = event.reason || '';
    const reasonCode = event.reasonCode || '';
    let state = 'disconnected';
    let detail = reason || '';
    let level = 'info';

    switch (status) {
        case js_andruavMessages.CONST_SOCKET_STATUS_CONNECTING:
            state = event.retrying === true ? 'retrying' : 'connecting';
            detail = reason || (event.retrying === true ? 'Retrying connection' : 'Connecting');
            level = event.retrying === true ? 'warn' : 'info';
            break;

        case js_andruavMessages.CONST_SOCKET_STATUS_CONNECTED:
            state = 'connecting';
            detail = reason || 'Socket connected';
            level = 'info';
            break;

        case js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED:
            state = 'connected';
            detail = reason || 'Session registered';
            level = 'info';
            break;

        case js_andruavMessages.CONST_SOCKET_STATUS_DISCONNECTED:
            state = event.retrying === true ? 'retrying' : 'disconnected';
            detail = reason || 'Disconnected';
            level = 'warn';
            break;

        case js_andruavMessages.CONST_SOCKET_STATUS_ERROR:
            state = event.retrying === true ? 'retrying' : (event.failed === true ? 'failed' : 'error');
            detail = reason || (event.failed === true ? 'Connection failed' : 'Socket error');
            level = event.retrying === true ? 'warn' : 'error';
            break;

        case js_andruavMessages.CONST_SOCKET_STATUS_DISCONNECTING:
        case js_andruavMessages.CONST_SOCKET_STATUS_UNREGISTERED:
        case js_andruavMessages.CONST_SOCKET_STATUS_FREASH:
        default:
            state = 'disconnected';
            detail = reason || 'Disconnected';
            level = 'info';
            break;
    }

    if (reasonCode) {
        detail = `${detail}${detail ? ' ' : ''}[${reasonCode}]`;
    }

    let message = '';
    if (state === 'retrying') {
        message = `WS retry ${attempt}/${maxAttempts || '?'}: ${detail}`;
    } else if (state === 'connected') {
        message = 'WS connected and registered';
    } else if (state === 'connecting') {
        message = `WS ${detail}`;
    } else if (state === 'failed' || state === 'error') {
        message = `WS failed: ${detail}`;
    } else {
        message = `WS ${detail}`;
    }

    fn_opsHealthSetWsState(state, detail, state === 'connected' ? 0 : attempt, maxAttempts, reasonCode, {
        source: 'ws',
        level: level,
        message: message,
    });
    fn_opsHealthSyncFromUnits();
}

export function fn_opsHealthHandleAuthDiag(stage, data = {}) {
    switch (stage) {
        case 'login_begin':
            v_store.global.auth = fn_mergeTimed(v_store.global.auth, {
                state: 'connecting',
                detail: 'Authenticating',
            });
            fn_pushHistory({
                source: 'auth',
                level: 'info',
                message: 'Authentication started',
            });
            break;

        case 'probe_failed_but_continue':
            fn_pushHistory({
                source: 'auth',
                level: 'warn',
                message: 'Health probe failed; continuing with login attempt',
            });
            break;

        case 'login_success':
            v_store.global.auth = fn_mergeTimed(v_store.global.auth, {
                state: 'ok',
                detail: 'Authenticated',
            });
            fn_pushHistory({
                source: 'auth',
                level: 'info',
                message: `Authentication successful (${data.serverHost || 'server'}:${data.serverPort || '-'})`,
            });
            break;

        case 'login_rejected':
            v_store.global.auth = fn_mergeTimed(v_store.global.auth, {
                state: 'failed',
                detail: data.message || 'Login rejected',
            });
            fn_pushHistory({
                source: 'auth',
                level: 'error',
                message: `Authentication rejected: ${data.message || 'Login failed'}`,
            });
            break;

        case 'login_exception':
            v_store.global.auth = fn_mergeTimed(v_store.global.auth, {
                state: 'failed',
                detail: data.message || 'Login exception',
            });
            fn_pushHistory({
                source: 'auth',
                level: 'error',
                message: `Authentication exception: ${data.message || 'Unknown error'}`,
            });
            break;

        default:
            return;
    }

    fn_emitUpdate();
}

export function fn_opsHealthHandleTelemetryRecovery(partyID, state, note = '', meta = {}) {
    if (!partyID) return;
    const unit = fn_ensureUnit(partyID);
    if (!unit) return;
    if (meta.unitName) {
        unit.unitName = meta.unitName;
    }

    const next = {
        recoveryState: state || 'idle',
        statusNote: note || '',
        retryCount: Number.isFinite(meta.attempt) ? meta.attempt : (unit.udp.retryCount || 0),
        retryMax: Number.isFinite(meta.maxAttempts) ? meta.maxAttempts : (unit.udp.retryMax || 0),
    };

    if (state === 'recovering') {
        next.state = 'recovering';
        next.detail = 'Recovering telemetry...';
    } else if (state === 'inactive') {
        next.state = 'inactive';
        next.detail = note || 'Inactive';
    } else if (state === 'idle') {
        if (unit.udp.active === true) {
            next.state = unit.udp.paused === true ? 'paused' : 'active';
            next.detail = `${unit.udp.ip || '-'}:${unit.udp.port || 0}`;
        } else {
            next.state = 'inactive';
            next.detail = note || 'Inactive';
        }
    }

    unit.udp = fn_mergeTimed(unit.udp, next);

    if (meta.log !== false) {
        const displayName = unit.unitName || partyID;
        let message = `${displayName} UDP ${state}`;
        let level = 'info';
        if (state === 'recovering') {
            message = `${displayName} UDP recovering`;
            level = 'warn';
        } else if (state === 'inactive') {
            message = `${displayName} UDP inactive${note ? ` (${note})` : ''}`;
            level = 'error';
        } else if (state === 'idle') {
            message = `${displayName} UDP recovery completed`;
            level = 'info';
        }
        fn_pushHistory({
            source: 'udp',
            level: level,
            message: message,
            partyID: partyID,
        });
    }

    fn_opsHealthSyncFromUnits();
}

export function fn_opsHealthHandleProxyInfo(p_unit) {
    if (!p_unit || typeof p_unit.getPartyID !== 'function') return;
    const partyID = p_unit.getPartyID();
    if (!partyID) return;
    const telemetry = p_unit.m_Telemetry || {};
    const udpNorm = fn_normalizeUdpState(telemetry);
    const unit = fn_ensureUnit(partyID);
    const prevState = unit?.udp?.state;
    const prevActive = unit?.udp?.active;
    const prevPaused = unit?.udp?.paused;
    const prevIp = unit?.udp?.ip;
    const prevPort = unit?.udp?.port;

    unit.unitName = p_unit.m_unitName || partyID;
    unit.udp = fn_mergeTimed(unit.udp, {
        state: udpNorm.state,
        detail: udpNorm.detail,
        active: telemetry.m_udpProxy_active === true,
        paused: telemetry.m_udpProxy_paused === true,
        ip: telemetry.m_udpProxy_ip || null,
        port: telemetry.m_udpProxy_port || 0,
        level: telemetry.m_telemetry_level || 0,
        recoveryState: telemetry.m_udpProxy_recovery_state || 'idle',
        statusNote: telemetry.m_udpProxy_status_note || '',
        retryCount: telemetry.m_udpProxy_retry_count || 0,
        retryMax: telemetry.m_udpProxy_retry_max || 0,
    });

    const changed = prevState !== unit.udp.state
        || prevActive !== unit.udp.active
        || prevPaused !== unit.udp.paused
        || prevIp !== unit.udp.ip
        || prevPort !== unit.udp.port;

    if (changed) {
        let level = 'info';
        if (unit.udp.state === 'recovering') level = 'warn';
        if (unit.udp.state === 'inactive' && unit.udp.statusNote === 'drone-side-inactive') level = 'error';

        fn_pushHistory({
            source: 'udp',
            level: level,
            message: `${unit.unitName} UDP ${unit.udp.state}${unit.udp.detail ? ` (${unit.udp.detail})` : ''}`,
            partyID: partyID,
        });
    }

    fn_opsHealthSyncFromUnits();
}

export function fn_opsHealthHandleVideoState(partyID, streaming, unitName = '') {
    if (!partyID) return;
    const unit = fn_ensureUnit(partyID);
    if (!unit) return;
    if (unitName) {
        unit.unitName = unitName;
    }

    const nextState = streaming === true ? 'streaming' : 'idle';
    const changed = unit.video.state !== nextState || unit.video.streaming !== (streaming === true);

    unit.video = fn_mergeTimed(unit.video, {
        state: nextState,
        streaming: streaming === true,
    });

    if (changed) {
        fn_pushHistory({
            source: 'video',
            level: 'info',
            message: `${unit.unitName || partyID} video ${nextState}`,
            partyID: partyID,
        });
    }

    fn_opsHealthSyncFromUnits();
}

export function fn_opsHealthSyncFromUnits() {
    const onlineUnits = fn_getOnlineVehicleUnits();
    const onlineIDs = new Set();

    let activeUnits = 0;
    let recoveringUnits = 0;
    let streamingUnits = 0;

    for (const unit of onlineUnits) {
        const partyID = unit.getPartyID ? unit.getPartyID() : null;
        if (!partyID) continue;
        onlineIDs.add(partyID);
        const telemetry = unit.m_Telemetry || {};
        const udpNorm = fn_normalizeUdpState(telemetry);
        const streaming = fn_isStreaming(unit);
        const unitState = fn_ensureUnit(partyID);

        if (telemetry.m_udpProxy_active === true) activeUnits += 1;
        if (udpNorm.state === 'recovering') recoveringUnits += 1;
        if (streaming === true) streamingUnits += 1;

        unitState.unitName = unit.m_unitName || partyID;
        unitState.udp = fn_mergeTimed(unitState.udp, {
            state: udpNorm.state,
            detail: udpNorm.detail,
            active: telemetry.m_udpProxy_active === true,
            paused: telemetry.m_udpProxy_paused === true,
            ip: telemetry.m_udpProxy_ip || null,
            port: telemetry.m_udpProxy_port || 0,
            level: telemetry.m_telemetry_level || 0,
            recoveryState: telemetry.m_udpProxy_recovery_state || 'idle',
            statusNote: telemetry.m_udpProxy_status_note || '',
            retryCount: telemetry.m_udpProxy_retry_count || 0,
            retryMax: telemetry.m_udpProxy_retry_max || 0,
        });
        unitState.video = fn_mergeTimed(unitState.video, {
            state: streaming === true ? 'streaming' : 'idle',
            streaming: streaming === true,
        });
        fn_applyGlobalWsToUnit(unitState);
    }

    Object.keys(v_store.units).forEach((partyID) => {
        if (!onlineIDs.has(partyID)) {
            delete v_store.units[partyID];
        }
    });

    const totalUnits = onlineUnits.length;
    const inactiveUnits = Math.max(0, totalUnits - activeUnits);
    let udpState = 'idle';
    let udpDetail = 'No vehicles online';

    if (totalUnits > 0) {
        if (recoveringUnits > 0) {
            udpState = 'recovering';
        } else if (activeUnits === totalUnits) {
            udpState = 'active';
        } else if (activeUnits > 0) {
            udpState = 'degraded';
        } else {
            udpState = 'inactive';
        }
        udpDetail = `${activeUnits}/${totalUnits} active`;
        if (recoveringUnits > 0) {
            udpDetail += `, ${recoveringUnits} recovering`;
        }
    }

    const videoState = totalUnits > 0 && streamingUnits > 0 ? 'active' : 'idle';
    const videoDetail = `${streamingUnits}/${totalUnits} streaming`;

    v_store.global.udp = fn_mergeTimed(v_store.global.udp, {
        state: udpState,
        detail: udpDetail,
        activeUnits: activeUnits,
        totalUnits: totalUnits,
        recoveringUnits: recoveringUnits,
        inactiveUnits: inactiveUnits,
    });
    v_store.global.video = fn_mergeTimed(v_store.global.video, {
        state: videoState,
        detail: videoDetail,
        streamingUnits: streamingUnits,
        totalUnits: totalUnits,
    });

    fn_emitUpdate();
}
