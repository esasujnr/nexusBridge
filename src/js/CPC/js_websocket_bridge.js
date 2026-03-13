import * as js_siteConfig from '../js_siteConfig.js';

import * as js_andruav_facade from '../server_comm/js_andruav_facade.js';
import { js_globals } from '../js_globals.js';
import * as js_andruavMessages from '../protocol/js_andruavMessages.js';
import { fn_getPrimaryUIUnit } from '../js_ui_state.js';
import { MAVLink20Processor, mavlink20 } from '../js_mavlink_v2.js';
import { fn_opsHealthAddEvent } from '../js_ops_health.js';

/**
 * CWebSocketBridge is a WebSocket client implementation that connects to a target port
 * and provides methods for sending and receiving messages.
 */
class CWebSocketBridge {

    /**
     * Constructor initializes the target port and sets up the WebSocket client.
     */
    constructor()
    {
        this.m_target_port = js_siteConfig.CONST_WEBSOCKET_BRIDGE_PORT;
        this.m_socket = null;
        this.m_isConnected = false;
        this.m_reconnectTimer = null;
        this.m_reconnectAttempt = 0;
        this.m_reconnectBaseDelayMs = 1200;
        this.m_reconnectMaxDelayMs = 12000;
        this.m_heartbeatTimer = null;
        this.m_heartbeatIntervalMs = 10000; // 1 per 10 sec MAVLink heartbeat
        this.m_shouldReconnect = false;
        this.m_mavlinkProcessor = new MAVLink20Processor(null, 0, 0);
        this.m_streamProfileTimer = null;
        this.m_streamPollIntervalMs = 500;
        this.m_streamProfile = [
            { id: mavlink20.MAVLINK_MSG_ID_HEARTBEAT, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_GLOBAL_POSITION_INT, periodMs: 500 },
            { id: mavlink20.MAVLINK_MSG_ID_GPS_RAW_INT, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_VFR_HUD, periodMs: 700 },
            { id: mavlink20.MAVLINK_MSG_ID_ATTITUDE, periodMs: 500 },
            { id: mavlink20.MAVLINK_MSG_ID_SYS_STATUS, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_BATTERY_STATUS, periodMs: 1500 },
            { id: mavlink20.MAVLINK_MSG_ID_MISSION_CURRENT, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_MISSION_ITEM_REACHED, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_NAV_CONTROLLER_OUTPUT, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_HOME_POSITION, periodMs: 3000 },
            { id: mavlink20.MAVLINK_MSG_ID_EXTENDED_SYS_STATE, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_LOCAL_POSITION_NED, periodMs: 1000 },
            { id: mavlink20.MAVLINK_MSG_ID_AUTOPILOT_VERSION, periodMs: 10000 },
            { id: mavlink20.MAVLINK_MSG_ID_SYSTEM_TIME, periodMs: 2000 },
            { id: mavlink20.MAVLINK_MSG_ID_STATUSTEXT, periodMs: 1500 },
        ];
        this.m_streamLastSent = {};
        this.m_streamUnitConfigSentAt = {};
        this.m_routeWarnAt = {};
        this.m_lastSysIdConflictSignature = '';
        this.m_maxSocketBufferedBytes = 2 * 1024 * 1024;
        this.m_lastBridgeBufferWarnAt = 0;
        this.m_inboundCommandQueue = [];
        this.m_inboundCommandQueueMax = 128;
        this.m_inboundCommandMaxAgeMs = 10000;
        this.m_runtimeStats = {
            txPackets: 0,
            txBytes: 0,
            txDropBackpressure: 0,
            txDropSocketUnavailable: 0,
            txSendErrors: 0,
            rxPackets: 0,
            rxBytes: 0,
            routeAttempts: 0,
            routeDelivered: 0,
            routeQueued: 0,
            routeDropped: 0,
            queuePushes: 0,
            queueDropsOverflow: 0,
            queueDropsStale: 0,
            reconnectScheduled: 0,
            lastReconnectReason: '',
            lastReconnectDelayMs: 0,
            lastConnectedAt: 0,
            lastDisconnectedAt: 0,
            lastDisconnectCode: 0,
            socketErrors: 0,
        };
    }

    /**
     * Initializes the WebSocket client and connects to the target port.
     */
    fn_init ()
    {
        this.m_shouldReconnect = true;

        if (this.m_reconnectTimer !== null)
        {
            window.clearTimeout(this.m_reconnectTimer);
            this.m_reconnectTimer = null;
        }

        // Check if the socket is already connected or connecting
        if (this.m_socket &&
            (this.m_socket.readyState === WebSocket.OPEN ||
             this.m_socket.readyState === WebSocket.CONNECTING))
        {
            return;
        }

        const url = this.#fn_getBridgeURL();

        try
        {
            this.m_socket = new WebSocket(url);
        }
        catch
        {
            this.m_isConnected = false;
            this.#fn_scheduleReconnect('init_exception');
            return;
        }

        // Ensure we receive binary data as ArrayBuffer when needed (e.g. MAVLink)
        this.m_socket.binaryType = 'arraybuffer';

        // Set up event handlers
        this.m_socket.onopen = () => {
            this.m_isConnected = true;
            this.m_reconnectAttempt = 0;
            this.m_runtimeStats.lastConnectedAt = Date.now();
            this.#fn_startHeartbeat();
            this.#fn_startStreamProfile();
            this.#fn_flushInboundCommandQueue();
            try
            {
                fn_opsHealthAddEvent({
                    source: 'bridge',
                    level: 'info',
                    message: 'Nexus Bridge link connected',
                });
            }
            catch
            {
                return;
            }
        };

        this.m_socket.onmessage = (event) => {
            this.receiveMessage(event.data);
        };

        this.m_socket.onerror = () => {
            // Ensure we clean up and trigger reconnect on error as well
            this.m_isConnected = false;
            this.m_runtimeStats.socketErrors += 1;
            this.#fn_stopHeartbeat();
            this.#fn_stopStreamProfile();

            try {
                if (this.m_socket &&
                    this.m_socket.readyState !== WebSocket.CLOSING &&
                    this.m_socket.readyState !== WebSocket.CLOSED)
                {
                    this.m_socket.close();
                }
            } catch (e) {
                // ignore close errors
            }
        };

        this.m_socket.onclose = (event) => {
            this.m_isConnected = false;
            this.m_runtimeStats.lastDisconnectedAt = Date.now();
            this.m_runtimeStats.lastDisconnectCode = Number(event?.code || 0);
            this.#fn_stopHeartbeat();
            this.#fn_stopStreamProfile();
            this.m_socket = null;

            try
            {
                fn_opsHealthAddEvent({
                    source: 'bridge',
                    level: 'warn',
                    message: `Nexus Bridge link disconnected (code ${event?.code ?? 'na'})`,
                });
            }
            catch
            {
                // no-op
            }

            this.#fn_scheduleReconnect(`socket_close_${event?.code ?? 'na'}`);
        };
    }

    fn_uninit()
    {
        this.m_shouldReconnect = false;
        this.m_isConnected = false;
        this.m_reconnectAttempt = 0;
        this.#fn_stopHeartbeat();
        this.#fn_stopStreamProfile();
        this.m_inboundCommandQueue = [];
        if (this.m_reconnectTimer !== null)
        {
            window.clearTimeout(this.m_reconnectTimer);
            this.m_reconnectTimer = null;
        }

        if (this.m_socket)
        {
            try
            {
                this.m_socket.onopen = null;
                this.m_socket.onmessage = null;
                this.m_socket.onerror = null;
                this.m_socket.onclose = null;
                if (this.m_socket.readyState === WebSocket.OPEN ||
                    this.m_socket.readyState === WebSocket.CONNECTING)
                {
                    this.m_socket.close();
                }
            }
            catch (e)
            {
                // ignore close errors
            }
        }

        this.m_socket = null;
    }

    fn_isEnabled()
    {
        return this.m_shouldReconnect === true;
    }

    fn_isConnected()
    {
        return this.m_isConnected === true;
    }

    fn_getRuntimeStats()
    {
        const socketBuffered = (
            this.m_socket && this.m_socket.readyState === WebSocket.OPEN
                ? Number(this.m_socket.bufferedAmount || 0)
                : 0
        );

        return {
            enabled: this.m_shouldReconnect === true,
            connected: this.m_isConnected === true,
            reconnectAttempt: this.m_reconnectAttempt,
            reconnectBaseDelayMs: this.m_reconnectBaseDelayMs,
            reconnectMaxDelayMs: this.m_reconnectMaxDelayMs,
            queueDepth: this.m_inboundCommandQueue?.length || 0,
            queueCapacity: this.m_inboundCommandQueueMax,
            socketBufferedBytes: socketBuffered,
            ...this.m_runtimeStats,
        };
    }

    #fn_getBridgeURL()
    {
        const protocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
        const port = this.m_target_port;
        return protocol + '//127.0.0.1:' + port + '/';
    }

    #fn_scheduleReconnect(reason = 'socket_close')
    {
        if (this.m_shouldReconnect !== true)
        {
            return;
        }

        if (this.m_reconnectTimer !== null)
        {
            return;
        }

        this.m_reconnectAttempt += 1;
        const attemptIndex = Math.max(0, this.m_reconnectAttempt - 1);
        const baseDelay = Math.min(
            this.m_reconnectMaxDelayMs,
            this.m_reconnectBaseDelayMs * Math.pow(2, attemptIndex)
        );
        const jitter = Math.floor(Math.random() * Math.max(200, Math.floor(baseDelay * 0.25)));
        const delayMs = baseDelay + jitter;

        this.m_reconnectTimer = window.setTimeout(() => {
            this.m_reconnectTimer = null;
            this.fn_init();
        }, delayMs);
        this.m_runtimeStats.reconnectScheduled += 1;
        this.m_runtimeStats.lastReconnectReason = reason;
        this.m_runtimeStats.lastReconnectDelayMs = delayMs;

        try
        {
            fn_opsHealthAddEvent({
                source: 'bridge',
                level: 'warn',
                message: `Bridge reconnect scheduled in ${delayMs}ms (${reason})`,
            });
        }
        catch
        {
            return;
        }
    }

    #fn_enqueueInboundCommand(arrayBuffer, targetPartyID = null)
    {
        if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0)
        {
            return;
        }

        if (this.m_inboundCommandQueue.length >= this.m_inboundCommandQueueMax)
        {
            this.m_inboundCommandQueue.shift();
            this.m_runtimeStats.queueDropsOverflow += 1;
        }

        this.m_inboundCommandQueue.push({
            payload: arrayBuffer.slice(0),
            targetPartyID: targetPartyID || null,
            at: Date.now(),
        });
        this.m_runtimeStats.queuePushes += 1;
    }

    #fn_flushInboundCommandQueue()
    {
        if (!this.m_inboundCommandQueue || this.m_inboundCommandQueue.length === 0)
        {
            return;
        }

        if (!js_globals?.v_andruavWS || typeof js_globals.v_andruavWS.fn_isRegistered !== 'function')
        {
            return;
        }

        if (js_globals.v_andruavWS.fn_isRegistered() !== true)
        {
            return;
        }

        const now = Date.now();
        const pending = this.m_inboundCommandQueue.splice(0, this.m_inboundCommandQueue.length);
        for (let i = 0; i < pending.length; i++)
        {
            const item = pending[i];
            if (!item || !(item.payload instanceof ArrayBuffer))
            {
                continue;
            }

            if ((now - Number(item.at || 0)) > this.m_inboundCommandMaxAgeMs)
            {
                this.m_runtimeStats.queueDropsStale += 1;
                continue;
            }

            const delivered = this.#fn_forwardInboundMavlinkPacket(item.payload, {
                allowQueue: false,
                preferredPartyID: item.targetPartyID || null,
            });

            if (delivered !== true)
            {
                this.#fn_enqueueInboundCommand(item.payload, item.targetPartyID || null);
                break;
            }
        }
    }

    #fn_getOnlineVehicleUnits()
    {
        const list = js_globals?.m_andruavUnitList;
        if (!list || typeof list.fn_getUnitValues !== 'function')
        {
            return [];
        }

        const units = list.fn_getUnitValues() || [];
        return units.filter((unit) => (
            unit
            && unit.m_defined === true
            && unit.m_IsGCS !== true
            && unit.m_IsDisconnectedFromGCS !== true
            && unit.m_IsShutdown !== true
        ));
    }

    #fn_warnRouteOnce(key, message, level = 'warn')
    {
        const now = Date.now();
        const lastAt = this.m_routeWarnAt[key] || 0;
        if ((now - lastAt) < 5000)
        {
            return;
        }
        this.m_routeWarnAt[key] = now;
        try
        {
            console.warn('[Bridge][Route]', message);
            fn_opsHealthAddEvent({
                source: 'bridge',
                level: level,
                message: message,
            });
        }
        catch
        {
            return;
        }
    }

    #fn_normalizeToArrayBuffer(data)
    {
        if (data instanceof ArrayBuffer)
        {
            return data;
        }

        if (ArrayBuffer.isView(data))
        {
            const start = data.byteOffset || 0;
            const end = start + (data.byteLength || 0);
            return data.buffer.slice(start, end);
        }

        return null;
    }

    #fn_findUnitByTargetSystem(targetSystem, targetComponent, units)
    {
        if (!Number.isFinite(targetSystem) || targetSystem <= 0)
        {
            return { unit: null, ambiguous: false };
        }

        const matched = (units || []).filter((unit) => {
            const systemID = Number(unit?.m_FCBParameters?.m_systemID || 0);
            return systemID === Number(targetSystem);
        });

        if (matched.length === 1)
        {
            return { unit: matched[0], ambiguous: false };
        }

        if (matched.length > 1)
        {
            if (Number.isFinite(targetComponent) && targetComponent >= 0)
            {
                const byComponent = matched.filter((unit) => Number(unit?.m_FCBParameters?.m_componentID || 0) === Number(targetComponent));
                if (byComponent.length === 1)
                {
                    return { unit: byComponent[0], ambiguous: false };
                }
            }

            const activePartyID = js_globals?.v_ui_active_party_id || null;
            if (activePartyID)
            {
                const activeMatch = matched.find((unit) => String(unit.getPartyID()) === String(activePartyID));
                if (activeMatch)
                {
                    return { unit: activeMatch, ambiguous: false };
                }
            }
            return { unit: null, ambiguous: true };
        }

        return { unit: null, ambiguous: false };
    }

    #fn_pickTargetUnitFromMavlink(messages, units)
    {
        for (const message of (messages || []))
        {
            if (!message) continue;
            const targetSystem = Number(
                message.target_system
                ?? message.target_system_id
                ?? message.targetSystem
            );
            const targetComponent = Number(
                message.target_component
                ?? message.target_component_id
                ?? message.targetComponent
            );
            if (Number.isFinite(targetSystem) && targetSystem > 0 && targetSystem !== 255)
            {
                const resolved = this.#fn_findUnitByTargetSystem(targetSystem, targetComponent, units);
                if (resolved.unit)
                {
                    return { unit: resolved.unit, ambiguous: false, targetSystem: targetSystem };
                }
                if (resolved.ambiguous === true)
                {
                    return { unit: null, ambiguous: true, targetSystem: targetSystem };
                }
            }
        }

        const activePartyID = js_globals?.v_ui_active_party_id || null;
        if (activePartyID)
        {
            const activeUnit = (units || []).find((unit) => String(unit.getPartyID()) === String(activePartyID));
            if (activeUnit)
            {
                return { unit: activeUnit, ambiguous: false, targetSystem: null };
            }
        }

        const primary = fn_getPrimaryUIUnit();
        if (primary)
        {
            const primaryMatch = (units || []).find((unit) => String(unit.getPartyID()) === String(primary.getPartyID()));
            if (primaryMatch)
            {
                return { unit: primaryMatch, ambiguous: false, targetSystem: null };
            }
        }

        return { unit: (units && units.length > 0) ? units[0] : null, ambiguous: false, targetSystem: null };
    }

    #fn_forwardInboundMavlinkPacket(arrayBuffer, options = {})
    {
        if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0)
        {
            this.m_runtimeStats.routeDropped += 1;
            return false;
        }
        this.m_runtimeStats.routeAttempts += 1;

        const allowQueue = options.allowQueue !== false;
        const preferredPartyID = options.preferredPartyID || null;

        if (!js_globals?.v_andruavWS || typeof js_globals.v_andruavWS.API_sendBinCMD !== 'function')
        {
            if (allowQueue === true)
            {
                this.#fn_enqueueInboundCommand(arrayBuffer, preferredPartyID);
                this.m_runtimeStats.routeQueued += 1;
            }
            else
            {
                this.m_runtimeStats.routeDropped += 1;
            }
            return false;
        }

        const units = this.#fn_getOnlineVehicleUnits();
        if (units.length === 0)
        {
            if (allowQueue === true)
            {
                this.#fn_enqueueInboundCommand(arrayBuffer, preferredPartyID);
                this.m_runtimeStats.routeQueued += 1;
            }
            else
            {
                this.m_runtimeStats.routeDropped += 1;
            }
            return false;
        }

        let targetUnit = null;
        if (preferredPartyID)
        {
            targetUnit = units.find((unit) => String(unit.getPartyID()) === String(preferredPartyID)) || null;
        }

        if (!targetUnit)
        {
            let messages = [];
            try
            {
                messages = this.m_mavlinkProcessor.parseBuffer(new Int8Array(arrayBuffer)) || [];
            }
            catch
            {
                messages = [];
            }

            const selected = this.#fn_pickTargetUnitFromMavlink(messages, units);
            if (selected?.ambiguous === true)
            {
                this.m_runtimeStats.routeDropped += 1;
                this.#fn_warnRouteOnce(
                    `dup_sysid_${selected.targetSystem || 'unknown'}`,
                    `Bridge dropped inbound command: duplicate SYSID ${selected.targetSystem || '?'} across multiple vehicles. Select active vehicle or set unique SYSIDs.`,
                    'error'
                );
                return false;
            }

            targetUnit = selected?.unit || null;
            if (!targetUnit && allowQueue === true)
            {
                this.#fn_enqueueInboundCommand(arrayBuffer, null);
                this.m_runtimeStats.routeQueued += 1;
            }
            else if (!targetUnit)
            {
                this.m_runtimeStats.routeDropped += 1;
            }
        }

        if (!targetUnit || typeof targetUnit.getPartyID !== 'function')
        {
            this.m_runtimeStats.routeDropped += 1;
            return false;
        }

        if (typeof js_globals.v_andruavWS.fn_isRegistered === 'function' && js_globals.v_andruavWS.fn_isRegistered() !== true)
        {
            if (allowQueue === true)
            {
                this.#fn_enqueueInboundCommand(arrayBuffer, targetUnit.getPartyID());
                this.m_runtimeStats.routeQueued += 1;
            }
            else
            {
                this.m_runtimeStats.routeDropped += 1;
            }
            return false;
        }

        const delivered = js_globals.v_andruavWS.API_sendBinCMD(
            targetUnit.getPartyID(),
            js_andruavMessages.CONST_TYPE_AndruavBinaryMessage_Mavlink,
            arrayBuffer
        );
        if (delivered === true)
        {
            this.m_runtimeStats.routeDelivered += 1;
            return true;
        }

        if (allowQueue === true)
        {
            this.#fn_enqueueInboundCommand(arrayBuffer, targetUnit.getPartyID());
            this.m_runtimeStats.routeQueued += 1;
        }
        else
        {
            this.m_runtimeStats.routeDropped += 1;
        }

        return false;
    }

    #fn_checkDuplicateSysIds(units)
    {
        const bySystemId = {};
        for (const unit of (units || []))
        {
            const sysId = Number(unit?.m_FCBParameters?.m_systemID || 0);
            if (!Number.isFinite(sysId) || sysId <= 0)
            {
                continue;
            }
            if (!bySystemId[sysId])
            {
                bySystemId[sysId] = [];
            }
            bySystemId[sysId].push(unit);
        }

        const conflicts = Object.keys(bySystemId)
            .filter((sysId) => bySystemId[sysId].length > 1)
            .map((sysId) => `${sysId}:${bySystemId[sysId].map((unit) => unit.getPartyID()).join('|')}`)
            .sort();

        const signature = conflicts.join(',');
        if (signature === this.m_lastSysIdConflictSignature)
        {
            return;
        }
        this.m_lastSysIdConflictSignature = signature;

        if (!signature)
        {
            return;
        }

        this.#fn_warnRouteOnce(
            'dup_sysid_global',
            `Duplicate vehicle SYSIDs detected (${conflicts.join(', ')}). Bridge routing may be ambiguous until SYSIDs are unique.`,
            'error'
        );
    }

    #fn_startStreamProfile()
    {
        if (this.m_streamProfileTimer !== null)
        {
            return;
        }

        this.m_streamProfileTimer = window.setInterval(() => {
            if (!this.m_isConnected || !this.m_socket || this.m_socket.readyState !== WebSocket.OPEN)
            {
                return;
            }

            if (!js_globals?.v_andruavWS || typeof js_globals.v_andruavWS.fn_isRegistered !== 'function')
            {
                return;
            }

            if (js_globals.v_andruavWS.fn_isRegistered() !== true)
            {
                return;
            }

            this.#fn_flushInboundCommandQueue();

            const units = this.#fn_getOnlineVehicleUnits();
            if (units.length === 0)
            {
                return;
            }

            this.#fn_checkDuplicateSysIds(units);

            const now = Date.now();
            for (const unit of units)
            {
                this.#fn_applyBridgeUnitTelemetryConfig(unit, now);
                for (const profileEntry of this.m_streamProfile)
                {
                    const key = `${unit.getPartyID()}:${profileEntry.id}`;
                    const lastSentAt = this.m_streamLastSent[key] || 0;
                    if ((now - lastSentAt) < profileEntry.periodMs)
                    {
                        continue;
                    }

                    js_andruav_facade.AndruavClientFacade.API_requestMavlinkMessageById(unit, profileEntry.id);
                    this.m_streamLastSent[key] = now;
                }
            }
        }, this.m_streamPollIntervalMs);
    }

    #fn_stopStreamProfile()
    {
        if (this.m_streamProfileTimer !== null)
        {
            window.clearInterval(this.m_streamProfileTimer);
            this.m_streamProfileTimer = null;
        }
        this.m_streamLastSent = {};
        this.m_streamUnitConfigSentAt = {};
    }

    #fn_applyBridgeUnitTelemetryConfig(unit, nowMs)
    {
        if (!unit || typeof unit.getPartyID !== 'function')
        {
            return;
        }

        const partyID = unit.getPartyID();
        const lastConfigAt = this.m_streamUnitConfigSentAt[partyID] || 0;
        const telemetry = unit.m_Telemetry || {};

        // Respect manual operator control from Smart Telemetry widget.
        if (telemetry.m_bridge_manual_override === true)
        {
            return;
        }

        const requiresRefresh = (
            telemetry.m_udpProxy_active !== true
            || telemetry.m_udpProxy_paused === true
            || Number(telemetry.m_telemetry_level || 0) < 3
        );

        if (!requiresRefresh && (nowMs - lastConfigAt) < 12000)
        {
            return;
        }

        if ((nowMs - lastConfigAt) < 2000)
        {
            return;
        }

        try
        {
            if (telemetry.m_udpProxy_active !== true)
            {
                js_andruav_facade.AndruavClientFacade.API_startTelemetry(unit);
            }
            js_andruav_facade.AndruavClientFacade.API_resumeTelemetry(unit);
            js_andruav_facade.AndruavClientFacade.API_adjustTelemetryDataRate(unit, 3);
            js_andruav_facade.AndruavClientFacade.API_requestUdpProxyStatus(unit);
        }
        catch
        {
            // ignore transient config errors
        }

        this.m_streamUnitConfigSentAt[partyID] = nowMs;
    }

    fn_isRawMavlinkPossible()
    {
        // Browser bridge can only forward what upstream cloud/drone modules provide.
        // If upstream sends a reduced stream, full raw MAVLink is not achievable client-only.
        return true;
    }

    /**
     * Sends a message over the WebSocket connection.
     * If p_message is an ArrayBuffer or a TypedArray (e.g. Int8Array for MAVLink),
     * it is sent as binary without JSON stringification. Otherwise, it is sent as text.
     * @param {string|object|ArrayBuffer|ArrayBufferView} p_message The message to send.
     */
    sendMessage(p_message)
    {
        // Check if the message is valid
        if (p_message === undefined || p_message === null)
        {
            return false;
        }

        let payload;

        // Handle binary MAVLink packets (ArrayBuffer or any TypedArray)
        if (p_message instanceof ArrayBuffer)
        {
            payload = p_message;
        }
        else if (ArrayBuffer.isView(p_message)) // TypedArray: Int8Array, Uint8Array, etc.
        {
            const start = p_message.byteOffset || 0;
            const end = start + (p_message.byteLength || 0);
            payload = p_message.buffer.slice(start, end);
        }
        else
        {
            // Convert the message to a string if necessary
            payload = (typeof p_message === 'string') ? p_message : JSON.stringify(p_message);
        }

        // Send the message if the socket is connected
        if (this.m_socket && this.m_socket.readyState === WebSocket.OPEN)
        {
            if (typeof payload !== 'string')
            {
                const bufferedAmount = Number(this.m_socket.bufferedAmount || 0);
                if (bufferedAmount > this.m_maxSocketBufferedBytes)
                {
                    this.m_runtimeStats.txDropBackpressure += 1;
                    const now = Date.now();
                    if ((now - this.m_lastBridgeBufferWarnAt) > 3000)
                    {
                        this.m_lastBridgeBufferWarnAt = now;
                        this.#fn_warnRouteOnce(
                            'bridge_buffer_overflow',
                            `Bridge output backlog high (${bufferedAmount} bytes). Dropping stale telemetry to keep link responsive.`,
                            'warn'
                        );
                    }
                    return false;
                }
            }

            try
            {
                this.m_socket.send(payload);
                this.m_runtimeStats.txPackets += 1;
                this.m_runtimeStats.txBytes += (
                    typeof payload === 'string'
                        ? payload.length
                        : Number(payload?.byteLength || 0)
                );
                return true;
            }
            catch
            {
                this.m_isConnected = false;
                this.m_runtimeStats.txSendErrors += 1;
                this.#fn_scheduleReconnect('send_exception');
                return false;
            }
        }

        this.m_runtimeStats.txDropSocketUnavailable += 1;
        return false;
    }

    /**
     * Handles incoming messages from the WebSocket connection.
     * @param {string} data The received message.
     */
    receiveMessage(data)
    {
        const normalized = this.#fn_normalizeToArrayBuffer(data);
        if (normalized)
        {
            this.m_runtimeStats.rxPackets += 1;
            this.m_runtimeStats.rxBytes += Number(normalized.byteLength || 0);
            this.#fn_forwardInboundMavlinkPacket(normalized);
            return;
        }

        if (typeof Blob !== 'undefined' && data instanceof Blob)
        {
            data.arrayBuffer()
                .then((buffer) => {
                    this.m_runtimeStats.rxPackets += 1;
                    this.m_runtimeStats.rxBytes += Number(buffer?.byteLength || 0);
                    this.#fn_forwardInboundMavlinkPacket(buffer);
                })
                .catch(() => {
                    // ignore malformed payloads
                });
            return;
        }
    }

    #fn_startHeartbeat()
    {
        if (this.m_heartbeatTimer !== null)
        {
            return;
        }

        this.m_heartbeatTimer = window.setInterval(() => {
            if (!this.m_isConnected || !this.m_socket || this.m_socket.readyState !== WebSocket.OPEN)
            {
                return;
            }

            try
            {
                js_andruav_facade.AndruavClientFacade.API_requestMavlinkHeartBeat();
            }
            catch (e)
            {
                // Swallow errors to avoid breaking the heartbeat loop
            }
        }, this.m_heartbeatIntervalMs);
    }

    #fn_stopHeartbeat()
    {
        if (this.m_heartbeatTimer === null)
        {
            return;
        }

        window.clearInterval(this.m_heartbeatTimer);
        this.m_heartbeatTimer = null;
    }
}

// Export the WebSocket bridge instance
export const js_websocket_bridge = new CWebSocketBridge();
