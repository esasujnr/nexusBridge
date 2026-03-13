
import React from 'react';
import ReactDOM from "react-dom/client";


import $ from 'jquery';
import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';


import RecordRTC from 'recordrtc';


import * as js_andruavMessages from './protocol/js_andruavMessages.js'
import * as js_siteConfig from './js_siteConfig'
import * as js_helpers from './js_helpers'
import { js_globals } from './js_globals.js';
import { EVENTS as js_event } from './js_eventList.js'
import { js_speak } from './js_speak'
import * as js_common from './js_common.js'
import * as js_andruavUnit from './js_andruavUnit'
import * as js_andruav_ws from './server_comm/js_andruav_ws.js'
import * as js_andruav_parser from './server_comm/js_andruav_parser.js'
import * as js_andruav_facade from './server_comm/js_andruav_facade.js'
import { ClssAndruavFencePlan } from './js_plan_fence.js'
import { js_andruavAuth } from './js_andruav_auth'
import { js_leafletmap } from './js_leafletmap'
import { js_eventEmitter } from './js_eventEmitter'
import { js_localStorage } from './js_localStorage'
import { js_webrtcstream } from './js_webrtcthin2.js'
import { js_adsbUnit } from './js_adsbUnit.js'
import { mavlink20 } from './js_mavlink_v2.js'
import { fn_getUnitColorKey, fn_getUnitColorPalette } from './js_unit_colors.js'
import {
	fn_opsHealthReset,
	fn_opsHealthSyncFromUnits,
	fn_opsHealthHandleSocketStatus,
	fn_opsHealthHandleTelemetryRecovery,
	fn_opsHealthHandleProxyInfo,
	fn_opsHealthHandleVideoState,
	fn_opsHealthAddEvent
} from './js_ops_health.js';
import {
	fn_applyUIFocusRendering,
	fn_applyUIFocusForUnit,
	fn_applyMissionLayerStylesAll,
	fn_applyMissionLayerStyleForUnit,
	fn_setUIActiveUnit,
	fn_uiStateReset
} from './js_ui_state.js';
import {
	fn_uiAlertsAdd,
	fn_uiAlertsReset
} from './js_ui_alerts.js';
import {
	fn_missionIntegrityReset,
	fn_missionIntegrityMarkReadRequested,
	fn_missionIntegrityMarkDroneMutationExpected,
	fn_missionIntegrityMarkMapCleared,
	fn_missionIntegrityUpdateFromDroneMission
} from './js_mission_integrity.js';
import {
	fn_commandFeedbackInit,
	fn_commandFeedbackReset
} from './js_command_feedback.js';

import { ClssMainContextMenu } from '../components/popups/jsc_main_context_menu.jsx'
import { ClssWaypointStepContextMenu } from '../components/popups/jsc_waypoint_step_content_menu.jsx'
import ClssMainUnitPopup from '../components/popups/jsc_main_unit_popup.jsx'
import { js_websocket_bridge } from './CPC/js_websocket_bridge.js'
import i18n from './i18n.js';

var oldAppend = $.fn.append;

$.fn.append = function ($el) {
	let dom = ($el instanceof $) ? $el[0] : $el
	if (dom && dom.tagName === 'SCRIPT') {
		this[0].appendChild(dom)
		return this
	}
	return oldAppend.apply(this, arguments)
}

var v_context_busy = false;

var info_unit_context_popup = null;
export function fn_closeContextPopup() {
	// Close whichever popup Leaflet currently considers active.
	try {
		if (js_leafletmap && js_leafletmap.m_Map && typeof js_leafletmap.m_Map.closePopup === 'function') {
			js_leafletmap.m_Map.closePopup();
		}
	} catch {
		// no-op
	}

	if (info_unit_context_popup === null || info_unit_context_popup === undefined) return;
	try {
		js_leafletmap.fn_hideInfoWindow(info_unit_context_popup);
	} catch {
		// no-op
	}
	info_unit_context_popup = null;
}

let selectedMissionFilesToRead = "";
const CONST_DEFAULT_MAP_LOCATION_GHANA = Object.freeze({
	lat: 7.9465,
	lng: -1.0232,
	zoom: 7
});
let v_hasAutoCenteredOnConnectedVehicle = false;
const WS_RECONNECT_MAX_ATTEMPTS = 4;
const WS_RECONNECT_BASE_DELAY_MS = 1500;
const UDP_RECOVERY_MAX_ATTEMPTS = 2;
const UDP_RECOVERY_POLL_MS = 1200;
const UDP_RECOVERY_COOLDOWN_MS = 8000;
const UDP_PROXY_INFO_STALE_MS = 75000;
const UDP_STATUS_WATCHDOG_INTERVAL_MS = 6000;
const UDP_STATUS_STALE_PROBE_GRACE_MS = 12000;
const UDP_STATUS_STALE_EVENT_COOLDOWN_MS = 90000;
const UDP_STATUS_STALE_PROBE_MAX_MISSES = 2;
const UDP_STATUS_AUTO_RECOVERY_COOLDOWN_MS = 180000;
const GPS_MARKER_UPDATE_MIN_MS = 120;
const MISSION_READ_LOCK_TIMEOUT_MS = 12000;
let v_wsReconnectTimer = null;
let v_wsReconnectAttempts = 0;
let v_wsReconnectCancelled = false;
let v_lastSocketStatusEvent = null;
let v_udpStatusWatchdogTimer = null;
const v_udpRecoveryJobs = {};
const v_udpRecoveryCooldown = {};
const v_udpStatusWatchdogNotifiedAt = {};
const v_udpStatusProbeJobs = {};
const v_udpStatusAutoRecoveryAt = {};
const v_gpsRenderJobs = {};
const v_missionReadLocks = Object.create(null);
const v_missionReadLockTimers = Object.create(null);

function fn_clearMissionReadLock(partyID) {
	if (!partyID) return;
	delete v_missionReadLocks[partyID];
	const timer = v_missionReadLockTimers[partyID];
	if (timer) {
		clearTimeout(timer);
		delete v_missionReadLockTimers[partyID];
	}
}

function fn_tryMissionReadLock(partyID) {
	if (!partyID) return true;
	if (v_missionReadLocks[partyID] === true) return false;
	v_missionReadLocks[partyID] = true;
	const oldTimer = v_missionReadLockTimers[partyID];
	if (oldTimer) clearTimeout(oldTimer);
	v_missionReadLockTimers[partyID] = setTimeout(() => {
		fn_clearMissionReadLock(partyID);
	}, MISSION_READ_LOCK_TIMEOUT_MS);
	return true;
}

function fn_diag(subsystem, stage, data = {}) {
	try {
		console.info('[DIAG]', {
			traceId: js_globals.v_connectTraceId || 'na',
			subsystem: subsystem,
			stage: stage,
			...data
		});
	} catch {
		return;
	}
}

function fn_newTraceID() {
	js_globals.v_connectTraceSeq = (js_globals.v_connectTraceSeq || 0) + 1;
	return `${Date.now().toString(36)}-${js_globals.v_connectTraceSeq.toString(36)}-${js_common.fn_generateRandomString(3)}`;
}

export const setSelectedMissionFilePathToRead = function (p_file_name) {
	selectedMissionFilesToRead = p_file_name;
}

export const QueryString = function () {
	let query_string = {};
	let query = window.location.search.substring(1); // Get the query string (excluding the '?')
	let vars = query.split("&"); // Split into individual key-value pairs

	for (let i = 0; i < vars.length; i++) {
		const pair = vars[i].split("="); // Split each pair into key and value
		const key = decodeURIComponent(pair[0]); // Decode the key
		const value = decodeURIComponent(pair[1] || ''); // Decode the value (default to empty string if missing)

		// Skip empty keys (e.g., "?=" or "?&")
		if (key === "") continue;

		// Handle duplicate keys (e.g., "param=1&param=2")
		if (typeof query_string[key] === "undefined") {
			// If this is the first entry with this key, assign the value directly
			query_string[key] = value;
		} else if (typeof query_string[key] === "string") {
			// If this is the second entry with this key, convert to an array
			query_string[key] = [query_string[key], value];
		} else {
			// If this is the third or later entry with this key, push to the array
			query_string[key].push(value);
		}
	}

	// Override the valueOf method to control boolean behavior
	query_string.valueOf = function () {
		// Return false if query_string is {"": ''} or {}
		return !(Object.keys(this).length === 0 || (Object.keys(this).length === 1 && this[""] === ''));
	};

	return query_string; // Return the parsed query string object
}();


/**
 * Retrieves the status of the current browser tab session.
 * 
 * This function checks if the current tab is a new session, a refreshed session,
 * or a duplicate session based on the tab ID stored in sessionStorage and localStorage.
 * 
 * @returns {string} - Returns 'new' if the session is starting for the first time,
 *                     'refresh' if the session is a refresh of an existing tab,
 *                     or 'duplicate' if the tab ID already exists in localStorage.
 */
export function getTabStatus() {
	const tabId = sessionStorage.getItem('tabId') || js_common.fn_generateRandomString(6);
	sessionStorage.setItem('tabId', tabId);

	const isSessionStart = sessionStorage.getItem('isSessionStart') === null;

	if (isSessionStart) {
		sessionStorage.setItem('isSessionStart', 'false'); // Mark session as started
	}

	if (localStorage.getItem(tabId)) {
		return 'duplicate';
	} else {
		localStorage.setItem(tabId, 'active');
		window.addEventListener('beforeunload', () => {
			localStorage.removeItem(tabId);
		});

		if (isSessionStart) {
			return 'new';
		} else {
			return 'refresh';
		}
	}
}



// COULD BE REMOVED I GUESS
function enableDragging() {
	(function ($) {
		$.fn.drags = function (opt) {

			opt = $.extend({ handle: "", cursor: "move" }, opt);
			let $el;
			if (opt.handle === "") {
				$el = this;
			} else {
				$el = this.find(opt.handle);
			}

			return $el.css('cursor', opt.cursor).on("mousedown", function (e) {
				let $drag;
				if (opt.handle === "") {
					$drag = $(this).addClass('draggable');
				} else {
					$drag = $(this).addClass('active-handle').parent().addClass('draggable');
				}
				const z_idx = $drag.css('z-index'),
					drg_h = $drag.outerHeight(),
					drg_w = $drag.outerWidth(),
					pos_y = $drag.offset().top + drg_h - e.pageY,
					pos_x = $drag.offset().left + drg_w - e.pageX;
				$drag.css('z-index', 1000).parents().on("mousemove", function (e) {
					$('.draggable').offset({
						top: e.pageY + pos_y - drg_h,
						left: e.pageX + pos_x - drg_w
					}).on("mouseup", function () {
						$(this).removeClass('draggable').css('z-index', z_idx);
					});
				});
				e.preventDefault(); // disable selection
			}).on("mouseup", function () {
				if (opt.handle === "") {
					$(this).removeClass('draggable');
				} else {
					$(this).removeClass('active-handle').parent().removeClass('draggable');
				}
			});
		}
	})($);


	//$("[data-bs-toggle=tooltip]").tooltip(); REACT2
	//$("[data-bs-toggle=tooltip]").drags();  REACT2
}


/**
 * Handles keyboard events for the application.
 * 
 * This function sets up a keydown event listener on the body element to handle
 * various keyboard shortcuts and prevent default behaviors for specific keys.
 * 
 * - If the `Alt` key is pressed, no specific action is taken.
 * - If the `Ctrl` key is pressed along with the `R` key, the default browser
 *   refresh behavior is prevented.
 * - If the target element is not a textarea, text input, email input, or password
 *   input, the following shortcuts are handled:
 *   - Pressing the `M` key (case insensitive) triggers the `fn_showMap` function.
 *   - Pressing the `R` key (case insensitive) triggers the `fn_showVideoMainTab` function.
 * 
 * @function fn_handleKeyBoard
 */
function fn_handleKeyBoard() {

	if (js_globals.CONST_MAP_EDITOR === true) {
		return;
	}

	$('body').on('keydown', function (p_event) {
		const key = p_event.key;
		p_event = p_event || window.event;
		if (key === null || key === undefined) return;

		if (p_event.type === "keydown") {
			if (p_event.altKey === true) {

			}

			if (p_event.ctrlKey) {
				const c = p_event.which || p_event.keyCode;
				if (c === 82) {
					p_event.preventDefault();
					p_event.stopPropagation();
				}
			}

			if ((p_event.target.type !== 'textarea')
				&& (p_event.target.type !== 'text')
				&& (p_event.target.type !== 'email')
				&& (p_event.target.type !== 'password')
				&& (p_event.target.type !== 'number')) {
				if (key.toLowerCase() === 'm') {
					fn_showMap();
				}

				if (key.toLowerCase() === 'r') {
					fn_showVideoMainTab();
				}
			}
		}
	});

}




export function fn_do_modal_confirmation(p_title, p_message, p_callback, p_yesCaption, p_style, p_noCaption) {
	if (p_style === null || p_style === undefined) {
		p_style = "bg-success";
	}
	p_style += " p-1 rounded_10px ";
	let callback = p_callback;
	let modal = $('#modal_saveConfirmation');

	if (modal.length) { // Check if modal exists
		modal.find('h4#title').html(p_title).attr('class', "modal-title " + p_style); //set class directly
		modal.find('div.modal-body').html(p_message);
		modal.find('button#modal_btn_confirm').off('click').on('click', function () {
			callback(true);
			js_common.showModal('#modal_saveConfirmation', false);
		});
		modal.find('button#btnCancel').off('click').on('click', function () {
			callback(false);
			js_common.showModal('#modal_saveConfirmation', false);
		});

		if (p_yesCaption === null || p_yesCaption === undefined) {
			p_yesCaption = "Yes";
		}
		if (p_noCaption === null || p_noCaption === undefined) {
			p_noCaption = "Cancel";
		}

		modal.find('button#modal_btn_confirm').html(p_yesCaption);
		modal.find('button#btnCancel').html(p_noCaption);

		modal.attr({
			'aria-modal': 'true',
			'aria-labelledby': 'title',
			'tabindex': '-1'
		}).trigger('focus'); // Focus the modal

		js_common.showModal('#modal_saveConfirmation', true);
	} else {
		console.error("Modal element not found.");
	}
}


export function fn_do_modal_apply_all(p_mission) {
	if (p_mission === null || p_mission === undefined) return;

	let modal = $('#modal_applyAll');
	if (!modal.length) {
		console.error("Apply All modal element not found.");
		return;
	}

	// Reset checkboxes and get current values from first mission item if available
	const missionItems = p_mission.m_all_mission_items_shaps;
	if (missionItems && missionItems.length > 0) {
		const firstItem = missionItems[0];
		if (firstItem.m_missionItem) {
			$('#txt_apply_altitude').val(firstItem.m_missionItem.alt || 30);
			$('#sel_apply_frametype').val(firstItem.m_missionItem.m_frameType || 3);
			if (firstItem.m_missionItem.m_speedRequired) {
				$('#txt_apply_speed').val(firstItem.m_missionItem.speed || 5);
			}
		}
	}

	modal.find('button#btnApplyAllConfirm').off('click').on('click', function () {
		const overrideExisting = $('#chk_override_existing').is(':checked');
		const applyAltitude = $('#chk_apply_altitude').is(':checked');
		const applyFrameType = $('#chk_apply_frametype').is(':checked');
		const applySpeed = $('#chk_apply_speed').is(':checked');

		const altitudeValue = parseFloat($('#txt_apply_altitude').val());
		const frameTypeValue = parseInt($('#sel_apply_frametype').val());
		const speedValue = parseFloat($('#txt_apply_speed').val());

		// Default altitude value (used to detect if user has modified it)
		const defaultAltitude = 30;

		// Apply to all mission items
		if (missionItems && missionItems.length > 0) {
			missionItems.forEach(marker => {
				if (marker.m_missionItem) {
					if (applyAltitude && !isNaN(altitudeValue)) {
						// Only apply if override is checked OR if altitude is still at default
						if (overrideExisting || marker.m_missionItem.alt === defaultAltitude) {
							marker.m_missionItem.alt = altitudeValue;
						}
					}
					if (applyFrameType) {
						// Only apply if override is checked OR if frame type hasn't been set
						if (overrideExisting || marker.m_missionItem.m_frameType === undefined) {
							marker.m_missionItem.m_frameType = frameTypeValue;
						}
					}
					if (applySpeed && !isNaN(speedValue)) {
						// Only apply if override is checked OR if speed is not required (not set)
						if (overrideExisting || !marker.m_missionItem.m_speedRequired) {
							marker.m_missionItem.speed = speedValue;
							marker.m_missionItem.m_speedRequired = true;
						}
					}
				}
			});

			// Update the mission path display
			p_mission.fn_updatePath(true);
		}

		js_common.showModal('#modal_applyAll', false);
	});

	modal.find('button#btnApplyAllCancel').off('click').on('click', function () {
		js_common.showModal('#modal_applyAll', false);
	});

	js_common.showModal('#modal_applyAll', true);
}


export function fn_takeLocalImage(p_andruavUnit, videoTrackID) {
	const v_videoctrl = '#videoObject' + videoTrackID;
	const v_video = $(v_videoctrl)[0];
	const v_canvas = document.createElement('canvas');
	v_canvas.width = v_video.videoWidth;
	v_canvas.height = v_video.videoHeight;
	const ctx = v_canvas.getContext('2d');

	//draw image to canvas. scale to target dimensions
	ctx.drawImage(v_video, 0, 0);

	//convert to desired file format
	let dataURI = v_canvas.toDataURL("image/png"); // can also use 'image/png'
	js_helpers.fn_saveData(dataURI, 'image/png');
}


export function fn_startrecord(v_andruavUnit, v_videoTrackID) {

	const v_talk = v_andruavUnit.m_Video.m_videoactiveTracks[v_videoTrackID];
	const recorder = RecordRTC(v_talk.stream, {
		type: 'video'
	});

	// Start recording
	recorder.startRecording();

	//   // Stop recording after 10 seconds
	//   setTimeout(() => {
	// 	recorder.stopRecording(() => {
	// 	  // Get the recorded video blob
	// 	  const videoBlob = recorder.getBlob();

	// 	  // Do something with the recorded video, e.g., upload it to a server
	// 	  console.log('Recorded video blob:', videoBlob);
	// 	});
	//   }, 10000);

	v_talk.videoRecording = true;
	v_talk.recorderObject = recorder;
	js_eventEmitter.fn_dispatch(js_event.EE_videoStreamRedraw, { 'andruavUnit': v_andruavUnit, 'v_track': v_videoTrackID });

}




function fn_doGimbalCtrlStep(unit, stepPitch, stepRoll, stepYaw) {
	js_globals.v_andruavFacade.API_do_GimbalCtrl(unit,
		stepPitch,
		stepRoll,
		stepYaw, false);
}

function fn_doGimbalCtrl(unit, pitch, roll, yaw) {
	js_globals.v_andruavFacade.API_do_GimbalCtrl(unit, pitch, roll, yaw, true);
}


export function fn_showVideoMainTab() {
	$('#div_map_view').hide();
	$('#div_video_control').show();
	if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
		window.dispatchEvent(new CustomEvent('nb-main-view-changed', { detail: { view: 'video' } }));
	}
}


function fn_activateClassicalView() {
	$('#row_2').show();
	$('#row_1').show();
	$('#row_1').removeClass();
	$('#row_2').removeClass();
	$('#row_1').addClass('col-lg-8 col-xl-8 col-xxl-8 col-12');
	$('#row_2').addClass('col-lg-4 col-xl-4 col-xxl-4 col-12');

	$('#div_map_view').show();
	$('#andruav_unit_list_array_fixed').hide();
	$('#andruav_unit_list_array_float').hide();

	$([document.documentElement, document.body]).animate({
		scrollTop: $("#row_2").offset().top
	}, 100);
}

export function fn_applyControl() {
	fn_activateClassicalView();
	js_leafletmap.fn_invalidateSize();
}




export function fn_showMap() {
	$('#div_video_control').hide();
	$('#div_map_view').show();
	if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
		window.dispatchEvent(new CustomEvent('nb-main-view-changed', { detail: { view: 'map' } }));
	}
}

function onWEBRTCSessionStarted(c_talk) {
	let v_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(c_talk.number);
	v_andruavUnit.m_Video.m_videoactiveTracks[c_talk.targetVideoTrack] = c_talk;
	js_eventEmitter.fn_dispatch(js_event.EE_videoStreamStarted, { 'andruavUnit': v_andruavUnit, 'talk': c_talk });
	js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, v_andruavUnit);
}

function onWEBRTCSessionEnded(c_talk) {
	let v_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(c_talk.number);

	v_andruavUnit.m_Video.m_videoactiveTracks[c_talk.targetVideoTrack].VideoStreaming = js_andruavUnit.CONST_VIDEOSTREAMING_OFF;
	js_eventEmitter.fn_dispatch(js_event.EE_videoStreamStopped, { 'andruavUnit': v_andruavUnit, 'talk': c_talk });
	js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, v_andruavUnit);
}


function onWEBRTCSessionOrphanEnded(c_number) {
	let v_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(c_number);
	v_andruavUnit.m_Video.m_videoactiveTracks[c_number].VideoStreaming = js_andruavUnit.CONST_VIDEOSTREAMING_OFF;
	js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, v_andruavUnit);
}






function fn_WEBRTC_login(v_partyID, v_trackID) {

	js_webrtcstream.onOrphanDisconnect = onWEBRTCSessionOrphanEnded;

	js_webrtcstream.joinStream(
		{

			'number': v_partyID,
			'targetVideoTrack': v_trackID,
			'v_andruavClient': js_globals.v_andruavClient,
			onDisplayVideo: onWEBRTCSessionStarted,
			onError: function (v_talk, v_errormsg) { js_speak.fn_speak(v_errormsg); },
			onRemovestream: function () {
			},
			onDisconnected: onWEBRTCSessionEnded,

		}
	);
}


export function fn_VIDEO_login(v_andruavVideo, v_trackId) {

	let len = v_andruavVideo.m_unit.m_Video.m_videoTracks.length;
	for (let i = 0; i < len; ++i) {
		if (v_andruavVideo.m_unit.m_Video.m_videoTracks[i].id === v_trackId) {
			switch (v_andruavVideo.m_unit.m_Video.m_videoTracks[i].p) {
				case js_andruavMessages.CONST_EXTERNAL_CAMERA_TYPE_RTCWEBCAM:
					fn_WEBRTC_login(v_andruavVideo.m_unit.getPartyID(), v_trackId);
					break;

				case js_andruavMessages.CONST_EXTERNAL_CAMERA_TYPE_FFMPEGWEBCAM:
					//NOT USED
					break;

				default:
					break;
			}
			break;
		}
	}
}


/*
	Video Recording
*/
export function fn_VIDEO_Record(v_andruavVideo, v_trackId, p_Start) {

	if (v_andruavVideo === null || v_andruavVideo === undefined) return;

	var len = v_andruavVideo.m_unit.m_Video.m_videoTracks.length;
	for (let i = 0; i < len; ++i) {
		if (v_andruavVideo.m_unit.m_Video.m_videoTracks[i].id === v_trackId) {
			js_globals.v_andruavFacade.API_CONST_RemoteCommand_recordVideo(v_andruavVideo.m_unit.getPartyID(), v_trackId, p_Start);
		}
	}
}


export function fn_doYAW(p_andruavUnit, targetAngle, turnRate, isClockwise, isRelative) {
	js_globals.v_andruavFacade.API_do_YAW(p_andruavUnit, targetAngle, turnRate, isClockwise, isRelative);
}

function fn_getadsbIcon(_obj, droneAltitude) {
	if (_obj.Help) {
		return '/images/station-in-action-icon.png';
	}

	var degIndex = parseInt(_obj.Heading / 22);


	if (_obj.Ground) {
		switch (degIndex) {
			case 15:
			case 0:
				return '/images/blure/adrone_gr_32x32.png';
			case 1:
			case 2:
				return '/images/blure/adrone_gr_32x32x45d.png';
			case 3:
			case 4:
				return '/images/blure/adrone_gr_32x32x90d.png';
			case 5:
			case 6:
				return '/images/blure/adrone_gr_32x32x135d.png';
			case 7:
			case 8:
				return '/images/blure/adrone_gr_32x32x180d.png';
			case 9:
			case 10:
				return '/images/blure/adrone_gr_32x32x225d.png';
			case 11:
			case 12:
				return '/images/blure/adrone_gr_32x32x270d.png';
			case 13:
			case 14:
				return '/images/blure/adrone_gr_32x32x315d.png';
			default: // NAN if Heading is null
				return '/images/blure/adrone_gr_32x32.png';
		}
	}



	if ((_obj.Alt) < 500) {
		// if plane under drone by any difference, or heigher by 500 then alert
		switch (degIndex) {
			case 15:
			case 0:
				return '/images/blure/adrone_br_32x32.png';
			case 1:
			case 2:
				return '/images/blure/adrone_br_32x32x45d.png';
			case 3:
			case 4:
				return '/images/blure/adrone_br_32x32x90d.png';
			case 5:
			case 6:
				return '/images/blure/adrone_br_32x32x135d.png';
			case 7:
			case 8:
				return '/images/blure/adrone_br_32x32x180d.png';
			case 9:
			case 10:
				return '/images/blure/adrone_br_32x32x225d.png';
			case 11:
			case 12:
				return '/images/blure/adrone_br_32x32x270d.png';
			case 13:
			case 14:
				return '/images/blure/adrone_br_32x32x315d.png';
			default: // NAN if Heading is null
				return '/images/blure/adrone_br_32x32.png';
		}
	}
	else {
		switch (degIndex) {
			case 15:
			case 0:
				return '/images/blure/adrone_bk_32x32.png';
			case 1:
			case 2:
				return '/images/blure/adrone_bk_32x32x45d.png';
			case 3:
			case 4:
				return '/images/blure/adrone_bk_32x32x90d.png';
			case 5:
			case 6:
				return '/images/blure/adrone_bk_32x32x135d.png';
			case 7:
			case 8:
				return '/images/blure/adrone_bk_32x32x180d.png';
			case 9:
			case 10:
				return '/images/blure/adrone_bk_32x32x225d.png';
			case 11:
			case 12:
				return '/images/blure/adrone_bk_32x32x270d.png';
			case 13:
			case 14:
				return '/images/blure/adrone_bk_32x32x315d.png';
			default: // NAN if Heading is null
				return '/images/blure/adrone_bk_32x32.png';
		}
	}
}

function fn_handleADSBPopup(p_obj) {

}

function fn_adsbExpiredUpdate(me) {
	const ADSB_OBJECT_TIMEOUT = 13000;
	const count = js_adsbUnit.count;
	const now = new Date();
	const p_keys = Object.keys(js_adsbUnit.List);

	for (let i = 0; i < count; ++i) {
		let adsb_obj = js_adsbUnit.List[p_keys[i]];

		if ((now - adsb_obj.m_last_access) > ADSB_OBJECT_TIMEOUT) {
			if (adsb_obj.p_marker !== null && adsb_obj.p_marker !== undefined) {
				js_leafletmap.fn_hideItem(adsb_obj.p_marker);
			}
		}
	}
}

function fn_adsbObjectUpdate(me, p_adsbObject) {
	var v_marker = p_adsbObject.p_marker;
	if (v_marker === null || v_marker === undefined) {
		var icon;
		switch (parseInt(p_adsbObject.m_emitter_type)) {
			case mavlink20.ADSB_EMITTER_TYPE_NO_INFO:
				icon = '/images/ufo.png';
				break;
			case mavlink20.ADSB_EMITTER_TYPE_LIGHT:
			case mavlink20.ADSB_EMITTER_TYPE_SMALL:
			case mavlink20.ADSB_EMITTER_TYPE_LARGE:
			case mavlink20.ADSB_EMITTER_TYPE_HIGH_VORTEX_LARGE:
			case mavlink20.ADSB_EMITTER_TYPE_HEAVY:
			case mavlink20.ADSB_EMITTER_TYPE_HIGHLY_MANUV:
			case mavlink20.ADSB_EMITTER_TYPE_UNASSIGNED:
			case mavlink20.ADSB_EMITTER_TYPE_GLIDER:
			case mavlink20.ADSB_EMITTER_TYPE_LIGHTER_AIR:
			case mavlink20.ADSB_EMITTER_TYPE_PARACHUTE:
			case mavlink20.ADSB_EMITTER_TYPE_ULTRA_LIGHT:
			case mavlink20.ADSB_EMITTER_TYPE_UNASSIGNED2:
			case mavlink20.ADSB_EMITTER_TYPE_UAV:
			case mavlink20.ADSB_EMITTER_TYPE_SPACE:
			case mavlink20.ADSB_EMITTER_TYPE_UNASSGINED3:
			case mavlink20.ADSB_EMITTER_TYPE_EMERGENCY_SURFACE:
			case mavlink20.ADSB_EMITTER_TYPE_SERVICE_SURFACE:
			case mavlink20.ADSB_EMITTER_TYPE_POINT_OBSTACLE:
				icon = '/images/Plane_Track.png';
				break;
			case mavlink20.ADSB_EMITTER_TYPE_ROTOCRAFT:
				icon = '/images/Quad_Track.png';
				break;
			default:
				// display nothing
				return;
		}

		var v_htmladsb = "<p class='text-warning margin_zero'>" + p_adsbObject.m_icao_address + "</p>";

		v_marker = js_leafletmap.fn_CreateMarker(icon, p_adsbObject.m_icao_address, null, false, false, v_htmladsb, [64, 64]);
		p_adsbObject.p_marker = v_marker;
	}

	js_leafletmap.fn_setPosition_bylatlng(p_adsbObject.p_marker, p_adsbObject.m_lat, p_adsbObject.m_lon, p_adsbObject.m_heading);
	js_leafletmap.fn_showItem(p_adsbObject.p_marker);
}

function fn_adsbUpdated(p_caller, p_data) {

}


function gui_alert(title, message, level) {
	$('#alert #title').html(title);
	$('#alert #title').html(title);
	$('#alert #msg').html(message);
	$('#alert').removeClass();
	$('#alert').addClass('alert alert-' + level);
	$('#alert').show();
};

function gui_alert_hide() {
	$('#alert').hide();
};

export function gui_toggleUnits(dontflip) {

	// use current metric as other browser could change it and you will lose the SYNC
	// Scenario: if two browsers one is meter and the other is feet, the last one that switch
	// will record the value and ubunts in the storage. if you changed from other browser then 
	// the values and unit of the latest browser will overwrite the saved one... but if you refresh
	// the browser instead of changing the units the latter will take the values of the first one.
	js_localStorage.fn_setMetricSystem(js_globals.v_useMetricSystem);

	if (js_localStorage.fn_getMetricSystem() === true) {
		if (dontflip !== true) js_globals.v_useMetricSystem = false;

		js_localStorage.fn_setMetricSystem(false);
		js_globals.CONST_DEFAULT_ALTITUDE = (js_helpers.CONST_METER_TO_FEET * js_globals.CONST_DEFAULT_ALTITUDE).toFixed(0);
		js_globals.CONST_DEFAULT_RADIUS = (js_helpers.CONST_METER_TO_FEET * js_globals.CONST_DEFAULT_RADIUS).toFixed(0);

		js_globals.CONST_DEFAULT_ALTITUDE_min = js_globals.CONST_DEFAULT_ALTITUDE_min * js_helpers.CONST_METER_TO_FEET;
		js_globals.CONST_DEFAULT_RADIUS_min = js_globals.CONST_DEFAULT_RADIUS_min * js_helpers.CONST_METER_TO_FEET;

		js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE = (js_helpers.CONST_METER_TO_FEET * js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE).toFixed(0);
		js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE = (js_helpers.CONST_METER_TO_FEET * js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE).toFixed(0);

		js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE_MIN = js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE_MIN * js_helpers.CONST_METER_TO_FEET;
		js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE_MIN = js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE_MIN * js_helpers.CONST_METER_TO_FEET;
	}
	else {
		if (dontflip !== true) js_globals.v_useMetricSystem = true;

		js_localStorage.fn_setMetricSystem(true);
		js_globals.CONST_DEFAULT_ALTITUDE = (js_helpers.CONST_FEET_TO_METER * js_globals.CONST_DEFAULT_ALTITUDE).toFixed(1);
		js_globals.CONST_DEFAULT_RADIUS = (js_helpers.CONST_FEET_TO_METER * js_globals.CONST_DEFAULT_RADIUS).toFixed(1);

		js_globals.CONST_DEFAULT_ALTITUDE_min = js_globals.CONST_DEFAULT_ALTITUDE_min * js_helpers.CONST_FEET_TO_METER;
		js_globals.CONST_DEFAULT_RADIUS_min = js_globals.CONST_DEFAULT_RADIUS_min * js_helpers.CONST_FEET_TO_METER;

		js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE = (js_helpers.CONST_FEET_TO_METER * js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE).toFixed(1);
		js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE = (js_helpers.CONST_FEET_TO_METER * js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE).toFixed(1);

		js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE_MIN = js_globals.CONST_DEFAULT_SWARM_HORIZONTAL_DISTANCE_MIN * js_helpers.CONST_FEET_TO_METER;
		js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE_MIN = js_globals.CONST_DEFAULT_SWARM_VERTICAL_DISTANCE_MIN * js_helpers.CONST_FEET_TO_METER;
	}
	js_localStorage.fn_setDefaultAltitude(js_globals.CONST_DEFAULT_ALTITUDE);
	js_localStorage.fn_setDefaultRadius(js_globals.CONST_DEFAULT_RADIUS);
};

export function fn_convertToMeter(value) {
	if (isNaN(value)) return 0;
	if (js_localStorage.fn_getMetricSystem() === true) {
		return value;
	}
	else {
		return value * js_helpers.CONST_FEET_TO_METER;
	}
};

function gui_initGlobalSection() {
	// REACT
	$("#yaw_knob").dial({
		fgColor: "#3671AB"
		, bgColor: "#36AB36"
		, thickness: .3
		, cursor: 10
		, displayPrevious: true
	})
		.css({ display: 'inline', padding: '0px 10px' });

	// unsolved: https://stackoverflow.com/questions/39152877/consider-marking-event-handler-as-passive-to-make-the-page-more-responsive
	$("#yaw_knob").knob({
		'change': function (v) {
			// Your change event handler code
		},
		'mousewheel': function (event) {
			event.preventDefault();
		},
		'touchstart': function (event) {
			event.preventDefault();
		},
	}, {
		'passive': true // Add the passive option to make the event listeners passive
	});



	$('#andruavUnitGlobals').hide();


};

function fn_setLapout() {
	fn_applyControl();
}

function fn_gps_getLocation() {
	const hasQueryLocation = QueryString.lat !== null && QueryString.lat !== undefined
		&& QueryString.lng !== null && QueryString.lng !== undefined;

	if (hasQueryLocation) {
		const queryLat = parseFloat(QueryString.lat);
		const queryLng = parseFloat(QueryString.lng);
		if (!Number.isNaN(queryLat) && !Number.isNaN(queryLng)) {
			js_leafletmap.fn_PanTo_latlng(queryLat, queryLng);
		}

		const queryZoom = parseInt(QueryString.zoom, 10);
		if (!Number.isNaN(queryZoom)) {
			js_leafletmap.fn_setZoom(queryZoom);
		}
		return;
	}

	js_leafletmap.fn_PanTo_latlng(
		CONST_DEFAULT_MAP_LOCATION_GHANA.lat,
		CONST_DEFAULT_MAP_LOCATION_GHANA.lng);
	js_leafletmap.fn_setZoom(CONST_DEFAULT_MAP_LOCATION_GHANA.zoom);
}

// function fn_gps_showPosition(position) {
// 	var latlng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
// 	map.panTo(latlng);
// 	map.setZoom(8);
// }


function saveData(fileURL, fileName) {
	//http://muaz-khan.blogspot.com.eg/2012/10/save-files-on-disk-using-javascript-or.html
	// for non-IE
	if (!window.ActiveXObject) {
		var save = document.createElement('a');
		save.href = fileURL;
		save.target = '_blank';
		save.download = fileName || 'unknown';
		save.click();
	}
}

export function fn_switchGPS(p_andruavUnit) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) {
		return;
	}

	js_globals.v_andruavFacade.API_setGPSSource(p_andruavUnit, (p_andruavUnit.m_GPS_Info1.gpsMode + 1) % 3)
}



function gui_camCtrl(p_partyID) {
	// var p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p_partyID);
	// if (p_andruavUnit === null || p_andruavUnit === undefined) {
	// 	return;
	// }

	// $('#modal_ctrl_cam').attr('partyID', p_partyID);
	// $('#modal_ctrl_cam').attr('data-original-title', 'Camera Control - ' + p_andruavUnit.m_unitName);
	// $('#modal_ctrl_cam').show();

}

export function gui_doYAW(p_partyID, p_onApply) {


	let p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p_partyID);

	if (p_andruavUnit === null || p_andruavUnit === undefined) {
		return;
	}

	js_eventEmitter.fn_dispatch(js_event.EE_displayYawDlgForm, p_andruavUnit);

	let ctrl_yaw = $('#modal_ctrl_yaw').find('#btnYaw');
	ctrl_yaw.off("click");
	ctrl_yaw.on('click', function () {
		const target_angle = $('#yaw_knob').val();
		if (typeof p_onApply === 'function') {
			// In callback mode, pass only the target angle; direction will be computed per-unit by the caller
			p_onApply(p_andruavUnit, target_angle);
		}
		else {
			const target_angle_deg = target_angle;
			const current_angle_deg = (js_helpers.CONST_RADIUS_TO_DEGREE * ((p_andruavUnit.m_Nav_Info.p_Orientation.yaw + js_helpers.CONST_PTx2) % js_helpers.CONST_PTx2)).toFixed(1);
			let direction = js_helpers.isClockwiseAngle(current_angle_deg, target_angle_deg);
			fn_doYAW(p_andruavUnit, target_angle, 0, !direction, false);
		}
	});

	ctrl_yaw = $('#modal_ctrl_yaw').find('#btnResetYaw');
	ctrl_yaw.off("click");
	ctrl_yaw.on('click', function () {
		$('#yaw_knob').val(0);
		$('#yaw_knob').trigger('change');
		if (typeof p_onApply === 'function') {
			// -1 indicates reset-to-heading; caller will handle direction per-unit
			p_onApply(p_andruavUnit, -1);
		}
		else {
			fn_doYAW(p_andruavUnit, -1, 0, true, false);
		}
	});


	$('#yaw_knob').val((js_helpers.CONST_RADIUS_TO_DEGREE * ((p_andruavUnit.m_Nav_Info.p_Orientation.yaw + js_helpers.CONST_PTx2) % js_helpers.CONST_PTx2)).toFixed(1));
	$('#yaw_knob').trigger('change');
	$('#modal_ctrl_yaw').attr('data-original-title', 'YAW Control - ' + p_andruavUnit.m_unitName);
	$('#modal_ctrl_yaw').attr('partyID', p_partyID);
	js_common.showDialog("modal_ctrl_yaw", true);
}


export function fn_doCircle2(p_partyID, latitude, longitude, altitude, radius, turns) {

	let p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p_partyID);
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;
	if ((p_andruavUnit.m_VehicleType === js_andruavUnit.VEHICLE_ROVER)
		|| (p_andruavUnit.m_VehicleType === js_andruavUnit.VEHICLE_BOAT)) return;

	function fn_doCircle2_prv() {
		js_speak.fn_speak('point recieved');
		js_globals.v_andruavFacade.API_do_CircleHere(p_partyID, latitude, longitude, altitude, radius, turns);
	}

	fn_doCircle2_prv(p_partyID);
}


export function fn_doSetHome(p_partyID, p_latitude, p_longitude, p_altitude) {
	fn_closeContextPopup();

	let p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p_partyID);
	if (p_andruavUnit !== null && p_andruavUnit !== undefined) {
		if (js_andruavAuth.fn_canExecuteAction('set_home') !== true) {
			const role = js_andruavAuth.fn_getRole();
			const deniedMsg = `[${role}] blocked Set Home for ${p_andruavUnit.m_unitName}`;
			fn_auditAction('warn', p_partyID, deniedMsg);
			fn_uiAlertsAdd({ source: 'audit', level: 'warn', partyID: p_partyID, message: deniedMsg });
			return;
		}
		fn_do_modal_confirmation("Set Home Location for  " + p_andruavUnit.m_unitName + "   " + p_andruavUnit.m_VehicleType_TXT,
			"Changing Home Location changes RTL destination. Are you Sure?", function (p_approved) {
				if (p_approved === false) return;
				js_speak.fn_speak('home sent');
				const sent = js_globals.v_andruavFacade.API_do_SetHomeLocation(p_partyID, p_latitude, p_longitude, p_altitude);
				if (sent === true) {
					fn_auditAction('info', p_partyID, `Set Home requested for ${p_andruavUnit.m_unitName}`);
				} else {
					fn_auditAction('warn', p_partyID, `Set Home send failed for ${p_andruavUnit.m_unitName}`);
				}

			}, "YES");
	}
}

export function fn_auditAction(level, partyID, message) {
	const entry = {
		source: 'audit',
		level: (level === 'error' || level === 'warn') ? level : 'info',
		partyID: partyID || '',
		message: String(message || '').trim()
	};
	if (!entry.message) return;
	fn_opsHealthAddEvent(entry);
}

export function fn_doFlyHere(p_partyID, p_latitude, p_longitude, altitude) {
	fn_closeContextPopup();
	let p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p_partyID);
	if (p_andruavUnit !== null && p_andruavUnit !== undefined) {
		if (js_andruavAuth.fn_canExecuteAction('fly_to_here') !== true) {
			const role = js_andruavAuth.fn_getRole();
			const deniedMsg = `[${role}] blocked Fly To Here for ${p_andruavUnit.m_unitName}`;
			fn_auditAction('warn', p_partyID, deniedMsg);
			fn_uiAlertsAdd({ source: 'audit', level: 'warn', partyID: p_partyID, message: deniedMsg });
			return;
		}
		js_speak.fn_speak('point recieved');
		const sent = js_globals.v_andruavFacade.API_do_FlyHere(p_partyID, p_latitude, p_longitude, altitude);
		if (sent === true) {
			fn_auditAction('warn', p_partyID, `Fly To Here requested for ${p_andruavUnit.m_unitName}`);
		} else {
			fn_auditAction('warn', p_partyID, `Fly To Here send failed for ${p_andruavUnit.m_unitName}`);
		}
	}
}


export function fn_doStartMissionFrom(p_partyID, p_missionNumber) {
	let p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p_partyID);
	if (p_andruavUnit !== null && p_andruavUnit !== undefined) {
		js_speak.fn_speak(String(p_missionNumber) + ' is a start point');
		js_globals.v_andruavFacade.API_do_StartMissionFrom(p_andruavUnit, p_missionNumber);
	}
}

/**
   Goto Unit on map
**/

export function fn_gotoUnit_byPartyID(p_partyID) {
	const p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p_partyID);
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	fn_setUIActiveUnit(p_andruavUnit.getPartyID());
	fn_gotoUnit(p_andruavUnit);

	js_globals.v_andruavFacade.API_do_GetHomeLocation(p_andruavUnit);
}

export function fn_gotoUnit(p_andruavUnit) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	let marker = p_andruavUnit.m_gui.m_marker;
	if (marker !== null && marker !== undefined) {
		js_leafletmap.fn_PanTo(p_andruavUnit.m_gui.m_marker);
		// commented because zoom need to be after pan is completed otherwise map pans to wrong location.
		// if (js_leafletmap.fn_getZoom() < 16) {
		// 	js_leafletmap.fn_setZoom(17);
		// }
	}
}

function fn_resetMapAutoCenterState() {
	v_hasAutoCenteredOnConnectedVehicle = false;
}

function fn_tryAutoCenterOnFirstConnectedVehicle(p_andruavUnit) {
	if (v_hasAutoCenteredOnConnectedVehicle === true) return;
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;
	if (p_andruavUnit.m_IsGCS === true) return; // first drone only

	const hasLocation = p_andruavUnit.m_Nav_Info && p_andruavUnit.m_Nav_Info.p_Location
		&& p_andruavUnit.m_Nav_Info.p_Location.lat !== null
		&& p_andruavUnit.m_Nav_Info.p_Location.lat !== undefined
		&& p_andruavUnit.m_Nav_Info.p_Location.lng !== null
		&& p_andruavUnit.m_Nav_Info.p_Location.lng !== undefined;

	if (hasLocation !== true) return;

	fn_gotoUnit(p_andruavUnit);
	v_hasAutoCenteredOnConnectedVehicle = true;
}

export function fn_helpPage(p_url) {
	window.open(p_url, '_blank');
}

export function fn_changeUnitInfo(p_andruavUnit) {
	if ((js_siteConfig.CONST_FEATURE.hasOwnProperty('DISABLE_UNIT_NAMING')) && (js_siteConfig.CONST_FEATURE.DISABLE_UNIT_NAMING === true)) return;

	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	$('#modal_changeUnitInfo').find('#title').html('Change Unit Name of ' + p_andruavUnit.m_unitName);
	$('#modal_changeUnitInfo').find('#txtUnitName').val(p_andruavUnit.m_unitName);
	$('#modal_changeUnitInfo').find('#txtDescription').val(p_andruavUnit.Description);
	$('#modal_changeUnitInfo').find('#btnOK').off("click");
	$('#modal_changeUnitInfo').find('#btnOK').on('click', function () {
		let v_unitName = $('#modal_changeUnitInfo').find('#txtUnitName').val();
		if (v_unitName === '' || v_unitName === undefined) return;

		let v_unitDescription = $('#modal_changeUnitInfo').find('#txtDescription').val();
		if (v_unitDescription === '' || v_unitDescription === undefined) return;

		js_globals.v_andruavFacade.API_setUnitName(p_andruavUnit, v_unitName, v_unitDescription);
	});

	js_common.showModal('#modal_changeUnitInfo', true);
}

export function fn_changeAltitude(p_andruavUnit, p_onApply) {

	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	const v_modal = $('#changespeed_modal');
	const v_txtSpeed = v_modal.find('#txtSpeed');
	v_modal.off('shown.bs.modal.changespeed_modal');
	v_modal.on('shown.bs.modal.changespeed_modal', function () {
		v_txtSpeed.trigger('focus');
	});
	v_txtSpeed.off('keydown.changespeed_modal');
	v_txtSpeed.on('keydown.changespeed_modal', function (e) {
		if (e.key === 'Enter' || e.keyCode === 13) {
			e.preventDefault();
			e.stopPropagation();
			v_modal.find('#btnOK').trigger('click');
			return;
		}
		if (e.key === 'Escape' || e.keyCode === 27) {
			e.preventDefault();
			e.stopPropagation();
			v_modal.find('#btnCancel').trigger('click');
		}
	});


	let v_altitude_val = p_andruavUnit.m_Nav_Info.p_Location.alt_relative != null ? (p_andruavUnit.m_Nav_Info.p_Location.alt_relative).toFixed(1) : 0;
	if (v_altitude_val < js_globals.CONST_DEFAULT_ALTITUDE_min) {
		v_altitude_val = fn_convertToMeter(js_localStorage.fn_getDefaultAltitude()).toFixed(1);
	}

	let v_altitude_unit = 'm';

	if (js_globals.v_useMetricSystem === false) {
		v_altitude_val = (v_altitude_val * js_helpers.CONST_METER_TO_FEET).toFixed(1);
		v_altitude_unit = 'ft';
	}



	$('#changespeed_modal').find('#title').html('Change Altitude of ' + p_andruavUnit.m_unitName);
	$('#changespeed_modal').find('#txtSpeed').val(v_altitude_val);
	$('#changespeed_modal').find('#txtSpeedUnit').html(v_altitude_unit);
	$('#changespeed_modal').find('#btnOK').off('click');
	$('#changespeed_modal').find('#btnOK').on('click', function () {
		let v_alt = $('#changespeed_modal').find('#txtSpeed').val();
		if (v_alt === '' || v_alt === undefined || isNaN(v_alt)) return;
		if (js_globals.v_useMetricSystem === false) {
			// the GUI in feet and FCB in meters
			v_alt = (parseFloat(v_alt) * js_helpers.CONST_FEET_TO_METER).toFixed(1);
		}
		let v_alt_cmd;
		if (p_andruavUnit.m_VehicleType === js_andruavUnit.VEHICLE_SUBMARINE) {
			v_alt_cmd = -v_alt;
		}
		else {
			v_alt_cmd = v_alt;
		}
		if (typeof p_onApply === 'function') {
			p_onApply(p_andruavUnit, parseFloat(v_alt_cmd));
		}
		else {
			js_globals.v_andruavFacade.API_do_ChangeAltitude(p_andruavUnit, v_alt_cmd);
		}
	});

	js_common.showModal('#changespeed_modal', true);
}

/**
 Open Change Speed Modal 
**/
export function fn_changeSpeed(p_andruavUnit, p_initSpeed, p_onApply) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	const v_modal = $('#changespeed_modal');
	const v_txtSpeed = v_modal.find('#txtSpeed');
	v_modal.off('shown.bs.modal.changespeed_modal');
	v_modal.on('shown.bs.modal.changespeed_modal', function () {
		v_txtSpeed.trigger('focus');
	});
	v_txtSpeed.off('keydown.changespeed_modal');
	v_txtSpeed.on('keydown.changespeed_modal', function (e) {
		if (e.key === 'Enter' || e.keyCode === 13) {
			e.preventDefault();
			e.stopPropagation();
			v_modal.find('#btnOK').trigger('click');
			return;
		}
		if (e.key === 'Escape' || e.keyCode === 27) {
			e.preventDefault();
			e.stopPropagation();
			v_modal.find('#btnCancel').trigger('click');
		}
	});

	let v_speed_val = p_initSpeed;
	if (v_speed_val === null || v_speed_val === undefined) {
		const ground_speed = p_andruavUnit.m_Nav_Info.p_Location.ground_speed;
		if (ground_speed !== null && ground_speed !== undefined) {
			v_speed_val = parseFloat(ground_speed);
		}
		else {
			v_speed_val = 0;
		}
	}

	let v_speed_unit;
	if (v_speed_val === null || v_speed_val === undefined) {
		return;
	} else {


		if (js_globals.v_useMetricSystem === true) {
			v_speed_val = v_speed_val.toFixed(1);
			v_speed_unit = 'm/s';
		}
		else {
			v_speed_val = (v_speed_val * js_helpers.CONST_METER_TO_MILE).toFixed(1);
			v_speed_unit = 'mph';
		}

	}

	$('#changespeed_modal').find('#title').html('Change Speed of ' + p_andruavUnit.m_unitName);
	$('#changespeed_modal').find('#btnOK').off("click");
	$('#changespeed_modal').find('#txtSpeed').val(v_speed_val);
	$('#changespeed_modal').find('#txtSpeedUnit').html(v_speed_unit);
	$('#changespeed_modal').find('#btnOK').on('click', function () {
		let v_speed = $('#changespeed_modal').find('#txtSpeed').val();
		if (v_speed === '' || v_speed === undefined || isNaN(v_speed)) return;
		if (js_globals.v_useMetricSystem === false) {
			// the GUI in miles and the FCB is meters
			v_speed = parseFloat(v_speed) * js_helpers.CONST_MILE_TO_METER;
		}
		const v_speed_cmd = parseFloat(v_speed);
		// save target speed as indication.
		p_andruavUnit.m_Nav_Info.p_UserDesired.m_NavSpeed = v_speed_cmd;
		if (typeof p_onApply === 'function') {
			p_onApply(p_andruavUnit, v_speed_cmd);
		}
		else {
			js_globals.v_andruavFacade.API_do_ChangeSpeed2(p_andruavUnit, v_speed_cmd);
		}
	});

	js_common.showModal('#changespeed_modal', true);
}

export function fn_changeUDPPort(p_andruavUnit, init_pot) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	const v_modal = $('#changespeed_modal');
	const v_txtSpeed = v_modal.find('#txtSpeed');
	v_modal.off('shown.bs.modal.changespeed_modal');
	v_modal.on('shown.bs.modal.changespeed_modal', function () {
		v_txtSpeed.trigger('focus');
	});
	v_txtSpeed.off('keydown.changespeed_modal');
	v_txtSpeed.on('keydown.changespeed_modal', function (e) {
		if (e.key === 'Enter' || e.keyCode === 13) {
			e.preventDefault();
			e.stopPropagation();
			v_modal.find('#btnOK').trigger('click');
			return;
		}
		if (e.key === 'Escape' || e.keyCode === 27) {
			e.preventDefault();
			e.stopPropagation();
			v_modal.find('#btnCancel').trigger('click');
		}
	});

	let v_port_val = init_pot;
	if (v_port_val === null || v_port_val === undefined) {
		v_port_val = p_andruavUnit.m_Telemetry.m_udpProxy_port;
	}

	$('#changespeed_modal').find('#title').html('Change Speed of ' + p_andruavUnit.m_unitName);
	$('#changespeed_modal').find('#btnOK').off("click");
	$('#changespeed_modal').find('#txtSpeed').val(v_port_val);
	$('#changespeed_modal').find('#txtSpeedUnit').html("");
	$('#changespeed_modal').find('#btnOK').on('click', function () {
		let v_port_val = $('#changespeed_modal').find('#txtSpeed').val();
		if (v_port_val === '' || v_port_val === undefined || isNaN(v_port_val) || v_port_val >= 0xffff) return;
		js_globals.v_andruavFacade.API_setUdpProxyClientPort(p_andruavUnit, parseInt(v_port_val));
	});

	js_common.showModal('#changespeed_modal', true);
}

/**
   Switch Video OnOff
*/
export function toggleVideo(p_andruavUnit) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;
	fn_retreiveCamerasList(p_andruavUnit);
}


function fn_retreiveCamerasList(p_andruavUnit) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	function fn_callback(p_session) {
		if ((p_session !== null && p_session !== undefined) && (p_session.status === 'connected')) {
			if ((p_session.m_unit.fn_getIsDE() === false) && (p_session.m_unit.m_Video.m_videoTracks.length < 2)) {
				fn_VIDEO_login(p_session, p_session.m_unit.m_Video.m_videoTracks[0].id);
				return;
			}
			else {
				js_eventEmitter.fn_dispatch(js_event.EE_displayStreamDlgForm, p_session);
			}
		}
	}

	js_globals.v_andruavFacade.API_requestCameraList(p_andruavUnit, fn_callback);
}


/**
   Switch Video OnOff
*/
export function toggleRecrodingVideo(p_andruavUnit) {

	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	function fn_callback(p_session) {
		if ((p_session !== null && p_session !== undefined) && (p_session.status === 'connected')) {

			if ((p_session.m_unit.fn_getIsDE() === false) && (p_session.m_unit.m_Video.m_videoTracks.length < 2)) {
				// backward compatibility ANdruav style.
				fn_VIDEO_Record(p_session, p_session.m_unit.m_Video.m_videoTracks[0].id, (p_session.m_unit.m_Video.m_videoTracks[0].r !== true));
				return;
			}
			else {
				js_eventEmitter.fn_dispatch(js_event.EE_displayStreamDlgForm, p_session);
			}
		}
	}

	js_globals.v_andruavFacade.API_requestCameraList(p_andruavUnit, fn_callback);
}


/**
   return should be good & bad in the same time for different fences.
*/
export function fn_isBadFencing(p_andruavUnit) {
	// !TODO CREATE A CONTROL.

	if (js_globals.v_andruavClient === null || js_globals.v_andruavClient === undefined) return 0b00;

	const keys = Object.keys(js_globals.v_andruavClient.m_andruavGeoFences);
	const size = Object.keys(js_globals.v_andruavClient.m_andruavGeoFences).length;

	/* 
		bit 0: out of green zone
		bit 1: in bad zone
		bit 2: in good zone
	*/
	let v_res = 0b00; // bit 1 is good & bit 0 is for bad
	for (let i = 0; i < size; ++i) {
		let fence = js_globals.v_andruavClient.m_andruavGeoFences[keys[i]];

		if ((fence.Units !== null && fence.Units !== undefined) && (fence.Units.hasOwnProperty(p_andruavUnit.getPartyID()))) {
			let geoFenceHitInfo = fence.Units[p_andruavUnit.getPartyID()].geoFenceHitInfo;
			if (geoFenceHitInfo !== null && geoFenceHitInfo !== undefined) {

				if (geoFenceHitInfo.hasValue === true) {
					if (geoFenceHitInfo.m_inZone && geoFenceHitInfo.m_shouldKeepOutside) {
						// violation
						v_res = v_res | 0b010; //bad
					}
					if (geoFenceHitInfo.m_inZone && !geoFenceHitInfo.m_shouldKeepOutside) {  // this is diddferent than commented one ... if in zone & should be m_inZone then ok
						// no Violation
						v_res = v_res | 0b100; // good
					}
					if (!geoFenceHitInfo.m_inZone && !geoFenceHitInfo.m_shouldKeepOutside) {  // this is diddferent than commented one ... if in zone & should be m_inZone then ok
						// no Violation
						v_res = v_res | 0b001; // not in greed zone   
					}
				}
				else {

					if (geoFenceHitInfo.m_shouldKeepOutside === true) {
						// because no HIT Event is sent when Drone is away of a Restricted Area.
						// it is only send when it cross it in or out or being in at first.
						// for green area a hit command is sent when being out for every green area.
						v_res = v_res | 0b100;
					}
				}
			}
		}
	}
	return v_res;
}

function deleteWayPointsofDrone(p_andruavUnit, p_wayPointArray) {
	gui_hideOldWayPointOfDrone(p_andruavUnit);
	p_andruavUnit.m_wayPoint = {};
	p_andruavUnit.m_wayPoint.wayPointPath = p_wayPointArray;
	p_andruavUnit.m_gui.m_wayPoint_markers = [];
	p_andruavUnit.m_gui.m_wayPoint_polygons = [];
}

/***
* Hide but does not delete 
***/
function gui_hideOldWayPointOfDrone(p_andruavUnit) {
	if (p_andruavUnit.m_wayPoint === null || p_andruavUnit.m_wayPoint === undefined) return;
	const markers = p_andruavUnit.m_gui.m_wayPoint_markers;
	if (markers === null || markers === undefined) return;

	let count = markers.length;
	for (let i = 0; i < count; i++) {
		const marker = markers[i];
		js_leafletmap.fn_hideItem(marker);
	}

	const polygons = p_andruavUnit.m_gui.m_wayPoint_polygons;
	if (polygons !== null && polygons !== undefined) {
		count = polygons.length;
		for (let i = 0; i < count; i++) {
			const polygon = polygons[i];
			js_leafletmap.fn_hideItem(polygon);
		}
	}

	const polylines = p_andruavUnit.m_wayPoint.polylines;
	if (polylines !== null && polylines !== undefined) {
		js_leafletmap.fn_hideItem(p_andruavUnit.m_wayPoint.polylines);
		//p_andruavUnit.m_wayPoint.polylines.setMap(null);
	}
}
function gui_setVisibleMarkersByVehicleType(vehicleType, visible) {
	const keys = js_globals.m_andruavUnitList.fn_getUnitKeys();
	const size = keys.length;

	for (let i = 0; i < size; ++i) {

		let p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(keys[i]);
		if (p_andruavUnit !== null && p_andruavUnit !== undefined) {
			if (p_andruavUnit.m_VehicleType === vehicleType) {
				const marker = p_andruavUnit.m_gui.m_marker;
				if (marker !== null && marker !== undefined) {
					marker.setVisible(visible);
				}
			}
		}
	}
}


export function hlp_getFlightMode(p_andruavUnit) {
	//These are Andruav flight modes not Ardupilot flight modes. They are mapped in mavlink plugin
	let text = "undefined";
	if (p_andruavUnit.m_flightMode !== null && p_andruavUnit.m_flightMode !== undefined) {
		switch (p_andruavUnit.m_flightMode) {
			case js_andruavUnit.CONST_FLIGHT_CONTROL_RTL:
				text = "RTL";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_SMART_RTL:
				text = "Smart RTL";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_FOLLOW_ME:
				text = "Follow Me";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_FOLLOW_UNITED:
				text = "Follow Me";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_AUTO:
				text = "Auto";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_STABILIZE:
				text = "Stabilize";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_ALT_HOLD:
				text = "Alt-H";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_MANUAL:
				text = "Manual";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_ACRO:
				text = "Acro";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_TAKEOFF:
				text = "Takeoff";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_GUIDED:
				text = "Guided";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_LOITER:
				text = "Loiter";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_POSTION_HOLD:
				text = "Pos-Hold";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_LAND:
				text = "Land";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_CIRCLE:
				text = "Circle";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_CRUISE:
				text = "Cruise";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_FBWA:
				text = "FBW A";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_FBWB:
				text = "FBW B";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_BRAKE:
				text = "Brake";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_HOLD:
				text = "Hold";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_SURFACE:
				text = "Surface";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_QHOVER:
				text = "QHover";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_QLOITER:
				text = "QLoiter";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_QSTABILIZE:
				text = "QStabilize";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_QLAND:
				text = "QLand";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_QRTL:
				text = "QRTL";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_INITIALIZE:
				text = "Initializing";
				break;
			case js_andruavUnit.CONST_FLIGHT_MOTOR_DETECT:
				text = "Motor Detect";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_MANUAL:
				text = "Manual";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_ALT_HOLD:
				text = "Alt-Hold";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_AUTO_TAKEOFF:
				text = "Takeoff";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_AUTO_MISSION:
				text = "Mission";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_AUTO_HOLD:
				text = "Hold";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_AUTO_RTL:
				text = "RTL";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_AUTO_LAND:
				text = "Land";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_AUTO_FOLLOW_TARGET:
				text = "Follow";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_AUTO_PRECLAND:
				text = "Precland";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_VTOL_TAKEOFF:
				text = "VT-Takeoff";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_ACRO:
				text = "Acro";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_STABILIZE:
				text = "Stabilize";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_OFF_BOARD:
				text = "Off-Board";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_RATTITUDE:
				text = "R-ATT";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_POSCTL_POSCTL:
				text = "Pos-Ctrl";
				break;
			case js_andruavUnit.CONST_FLIGHT_PX4_POSCTL_ORBIT:
				text = "Orbit";
				break;
			case js_andruavUnit.CONST_FLIGHT_CONTROL_UNKNOWN:
			default:
				text = "Unknown";
				break;
		}
	}
	return i18n.t(`general:fightMode.${text.toLowerCase()}`, { defaultValue: text });
}


function hlp_generateFlyHereMenu(lat, lng) {

	return "<div id='context_menu_here' class='margin_zero padding_zero row'/>";
}


function fn_generateContextMenuHTML(v_lat, v_lng) {
	if (v_context_busy === true) return;

	v_context_busy = true;
	// Create a temporary container for the popup content
	const tempContainer = document.createElement('div');

	const root = ReactDOM.createRoot(tempContainer);
	root.render(
		<ClssMainContextMenu
			p_lat={v_lat}
			p_lng={v_lng}
			OnComplete={(e) => {

				// Create a DIV in leaflet popup 
				const htmlContent = tempContainer.innerHTML;

				// REACT POPUP LIMITATION: This creates static HTML content
				// Interactive React elements (links, buttons, events) will not work
				// See documentation in fn_generateContextMenuHTML_MainUnitPopup for details
				info_unit_context_popup = js_leafletmap.fn_showInfoWindow(null, htmlContent, v_lat, v_lng, 'nb-context-popup');

				// now add your div that contains ReactDOM to it.
				info_unit_context_popup = js_leafletmap.fn_bindPopup(info_unit_context_popup, tempContainer, v_lat, v_lng, 'nb-context-popup');

				info_unit_context_popup.on('remove', function (e) {
					info_unit_context_popup = null;
					tempContainer.remove();
				});
				v_context_busy = false;
			}}
		/>
	);
}

function fn_generateContextMenuHTML_MissionItem(v_lat, v_lng, p_wayPointStep, p_andruavUnit) {
	if (v_context_busy === true) return;

	v_context_busy = true;
	// Create a temporary container for the popup content
	const tempContainer = document.createElement('div');

	const root = ReactDOM.createRoot(tempContainer);
	root.render(
		<ClssWaypointStepContextMenu
			p_unit={p_andruavUnit}
			p_waypoint={p_wayPointStep}
			p_lat={v_lat} p_lng={v_lng}
			OnComplete={(e) => {

				// Create a DIV in leaflet popup 
				const htmlContent = tempContainer.innerHTML;

				// REACT POPUP LIMITATION: This creates static HTML content
				// Interactive React elements (links, buttons, events) will not work
				// See documentation in fn_generateContextMenuHTML_MainUnitPopup for details
				info_unit_context_popup = js_leafletmap.fn_showInfoWindow(null, htmlContent, v_lat, v_lng, 'nb-context-popup nb-waypoint-popup');

				// now add your div that contains ReactDOM to it.
				info_unit_context_popup = js_leafletmap.fn_bindPopup(info_unit_context_popup, tempContainer, v_lat, v_lng, 'nb-context-popup nb-waypoint-popup');

				// now your ReactDom div is under the active popup

				info_unit_context_popup.on('remove', function (e) {
					info_unit_context_popup = null;
					tempContainer.remove();
				});
				v_context_busy = false;
			}}
		/>
	);
}



function fn_generateContextMenuHTML_MainUnitPopup(v_lat, v_lng, v_andruavUnit, v_ignore) {


	if (v_context_busy === true) return;

	v_context_busy = true;
	// Create a temporary container for the popup content
	const tempContainer = document.createElement('div');


	const root = ReactDOM.createRoot(tempContainer);
	root.render(
		<ClssMainUnitPopup
			p_unit={v_andruavUnit}
			p_lat={v_lat}
			p_lng={v_lng}

			OnComplete={(e) => {
				// Step 3: Extract the HTML
				const htmlContent = tempContainer.innerHTML;

				// IMPORTANT: React popup limitation
				// This approach creates a static HTML snapshot for Leaflet popups.
				// - React event handlers and interactive elements will NOT work after tempContainer.remove()
				// - Links, buttons, and other interactive elements become non-functional
				// - This is intentional for display-only popups to avoid React/Leaflet integration complexity
				// 
				// FUTURE: If interactive popups are needed, consider:
				// 1. Using Leaflet's popupopen/popupclose events to mount/unmount React components
				// 2. Implementing a React portal system for Leaflet popups
				// 3. Using a React-Leaflet integration library
				//
				// Current limitation documented: Static popup content only
				tempContainer.remove();  // the HTML is not linked to REACT object anymore so links will not be working.

				info_unit_context_popup = js_leafletmap.fn_showInfoWindow(null, htmlContent, v_lat, v_lng, 'nb-context-popup nb-unit-popup');
				if (v_ignore === true) {
					info_unit_context_popup.m_ignoreMouseOut = true;
				}
				info_unit_context_popup.on('remove', function (e) {
					info_unit_context_popup = null;
				});
				v_context_busy = false;
			}}
		/>
	);

}



export function fn_contextMenu(p_position) {
	// use JS Dom methods to create the menu
	// use event.pixel.x and event.pixel.y 
	// to position menu at mouse position

	if (js_globals.m_markGuided !== null && js_globals.m_markGuided !== undefined) {
		js_leafletmap.fn_hideItem(js_globals.m_markGuided);
		js_globals.m_markGuided = null;
	}

	js_globals.m_markGuided = js_leafletmap.fn_CreateMarker('/images/waypoint_bg_32x32.png', 'target', [16, 32], true, true);
	js_leafletmap.fn_setPosition(js_globals.m_markGuided, p_position);

	js_leafletmap.fn_addListenerOnClickMarker(js_globals.m_markGuided,

		function (p_lat, p_lng) {

			fn_generateContextMenuHTML(p_lat, p_lng);
		});

	//fn_generateContextMenuHTML(js_leafletmap.fn_getLocationObjectBy_latlng(p_lat, p_lng));
};

/////////////////////////////////////////////////////////////////////////////// MAP Functions
var map = null;
var infowindow = null;
function initMap() {
	try {
		js_leafletmap.fn_initMap('mapid');
		fn_setLapout();
		fn_gps_getLocation();
	}
	catch (e) {
		console.log(e);
	}

};


function resetzoom() {
	js_leafletmap.setZoom(2);
}

/////////////////////////////////////////////////////////////////////////////// Events from AndruavClientParser

function fn_clearWsReconnectTimer() {
	if (v_wsReconnectTimer !== null) {
		clearTimeout(v_wsReconnectTimer);
		v_wsReconnectTimer = null;
	}
}

function fn_clearGpsRenderJobs() {
	Object.keys(v_gpsRenderJobs).forEach((partyID) => {
		const job = v_gpsRenderJobs[partyID];
		if (job && job.timer) {
			clearTimeout(job.timer);
		}
		delete v_gpsRenderJobs[partyID];
	});
}

function fn_scheduleGpsMarkerRender(p_andruavUnit) {
	if (!p_andruavUnit || typeof p_andruavUnit.getPartyID !== 'function') return;
	if (!p_andruavUnit.m_gui || !p_andruavUnit.m_gui.m_marker) return;
	const partyID = p_andruavUnit.getPartyID();
	if (!partyID) return;

	const doRender = () => {
		const now = Date.now();
		const entry = v_gpsRenderJobs[partyID] || {};
		entry.lastAt = now;
		entry.timer = null;
		v_gpsRenderJobs[partyID] = entry;

		fn_refreshVehicleMarkerIcon(p_andruavUnit, false);
		js_leafletmap.fn_showItem(p_andruavUnit.m_gui.m_marker);
		js_leafletmap.fn_setPosition_bylatlng(
			p_andruavUnit.m_gui.m_marker,
			p_andruavUnit.m_Nav_Info.p_Location.lat,
			p_andruavUnit.m_Nav_Info.p_Location.lng,
			p_andruavUnit.m_Nav_Info.p_Orientation.yaw
		);
		fn_tryAutoCenterOnFirstConnectedVehicle(p_andruavUnit);
		fn_applyUIFocusForUnit(p_andruavUnit);
		js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, p_andruavUnit);
	};

	const entry = v_gpsRenderJobs[partyID] || { lastAt: 0, timer: null };
	v_gpsRenderJobs[partyID] = entry;

	const elapsed = Date.now() - (entry.lastAt || 0);
	if (elapsed >= GPS_MARKER_UPDATE_MIN_MS && entry.timer === null) {
		doRender();
		return;
	}

	if (entry.timer !== null) return;
	const waitMs = Math.max(20, GPS_MARKER_UPDATE_MIN_MS - elapsed);
	entry.timer = setTimeout(() => {
		doRender();
	}, waitMs);
}

function fn_dispatchRetryStatus(retrying, failed, reason, attempt = 0, reasonCode = '') {
	const statusPayload = {
		status: retrying ? js_andruavMessages.CONST_SOCKET_STATUS_CONNECTING : js_andruavMessages.CONST_SOCKET_STATUS_ERROR,
		name: retrying ? 'Connecting' : 'Error',
		retrying: retrying === true,
		failed: failed === true,
		reason: reason || '',
		reasonCode: reasonCode || '',
		attempt: attempt,
		maxAttempts: WS_RECONNECT_MAX_ATTEMPTS
	};
	js_eventEmitter.fn_dispatch(js_event.EE_onSocketStatus, statusPayload);
	fn_opsHealthHandleSocketStatus(statusPayload);
}

function fn_socketReasonCodeFromEvent(event, status) {
	if (!event || typeof event !== 'object') {
		if (status === js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) return 'registered';
		return '';
	}
	if (event.reasonCode) return String(event.reasonCode);

	const closeCode = Number.isFinite(event.closeCode) ? event.closeCode : null;
	if (closeCode !== null) {
		switch (closeCode) {
			case 1000:
				return 'closed_normal';
			case 1001:
				return 'closed_going_away';
			case 1002:
				return 'closed_protocol_error';
			case 1003:
				return 'closed_unsupported_data';
			case 1006:
				return 'closed_abnormal';
			case 1008:
				return 'closed_policy_violation';
			case 1011:
				return 'closed_server_error';
			case 1013:
				return 'closed_try_again_later';
			default:
				return `closed_${closeCode}`;
		}
	}

	const errorKind = String(event.errorKind || '').trim();
	if (errorKind) return errorKind;
	if (status === js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) return 'registered';
	if (status === js_andruavMessages.CONST_SOCKET_STATUS_CONNECTING && event.retrying === true) return 'retrying';
	if (status === js_andruavMessages.CONST_SOCKET_STATUS_DISCONNECTED) return 'disconnected';
	if (status === js_andruavMessages.CONST_SOCKET_STATUS_ERROR) return event.failed === true ? 'failed' : 'socket_error';
	return '';
}

function fn_setTelemetryRecoveryState(p_andruavUnit, state, note, attempt = 0, maxAttempts = 0) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;
	p_andruavUnit.m_Telemetry.m_udpProxy_recovery_state = state;
	p_andruavUnit.m_Telemetry.m_udpProxy_status_note = note || '';
	p_andruavUnit.m_Telemetry.m_udpProxy_retry_count = attempt || 0;
	p_andruavUnit.m_Telemetry.m_udpProxy_retry_max = maxAttempts || 0;
	fn_opsHealthHandleTelemetryRecovery(
		p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : null,
		state,
		note || '',
		{ unitName: p_andruavUnit.m_unitName, log: false, attempt: attempt || 0, maxAttempts: maxAttempts || 0 }
	);
	js_eventEmitter.fn_dispatch(js_event.EE_onProxyInfoUpdated, p_andruavUnit);
}

function fn_clearTelemetryRecoveryJob(partyID) {
	const job = v_udpRecoveryJobs[partyID];
	if (!job) return;
	if (job.timer) clearTimeout(job.timer);
	delete v_udpRecoveryJobs[partyID];
}

function fn_clearUdpStatusProbeJob(partyID) {
	if (!partyID) return;
	delete v_udpStatusProbeJobs[partyID];
}

function fn_stopUdpStatusWatchdog() {
	if (v_udpStatusWatchdogTimer !== null) {
		clearInterval(v_udpStatusWatchdogTimer);
		v_udpStatusWatchdogTimer = null;
	}
}

function fn_startUdpStatusWatchdog() {
	if (v_udpStatusWatchdogTimer !== null) return;
	v_udpStatusWatchdogTimer = setInterval(() => {
		const units = fn_getOnlineVehicleUnits();
		if (!units || units.length === 0) return;
		const now = Date.now();
		for (const unit of units) {
			if (!unit || !unit.m_Telemetry || typeof unit.getPartyID !== 'function') continue;
			const telemetry = unit.m_Telemetry;
			const partyID = unit.getPartyID();
			if (!partyID) continue;
			if (telemetry.m_udpProxy_recovery_state === 'recovering') continue;
			if (telemetry.m_udpProxy_active !== true || telemetry.m_udpProxy_paused === true) {
				fn_clearUdpStatusProbeJob(partyID);
				delete v_udpStatusWatchdogNotifiedAt[partyID];
				continue;
			}

			const lastInfoAt = Number(telemetry.m_udpProxy_last_info_at || 0);
			const stale = (lastInfoAt <= 0) || ((now - lastInfoAt) > UDP_PROXY_INFO_STALE_MS);
			if (!stale) {
				fn_clearUdpStatusProbeJob(partyID);
				delete v_udpStatusWatchdogNotifiedAt[partyID];
				continue;
			}

			const probeState = v_udpStatusProbeJobs[partyID];
			if (!probeState) {
				v_udpStatusProbeJobs[partyID] = {
					probeAt: now,
					lastRecoverAttemptAt: 0,
					misses: 0
				};
				try {
					js_globals.v_andruavFacade.API_requestUdpProxyStatus(unit);
				} catch {
					// no-op
				}
				fn_diag('udp', 'status_probe_requested', { partyID: partyID });
				continue;
			}

			if ((now - Number(probeState.probeAt || 0)) < UDP_STATUS_STALE_PROBE_GRACE_MS) {
				continue;
			}

			if ((now - Number(probeState.lastRecoverAttemptAt || 0)) < UDP_RECOVERY_COOLDOWN_MS) {
				continue;
			}

			// Re-check freshness right before escalation. Parser updates this timestamp asynchronously.
			const refreshedLastInfoAt = Number(telemetry.m_udpProxy_last_info_at || 0);
			const stillStale = (refreshedLastInfoAt <= 0) || ((now - refreshedLastInfoAt) > UDP_PROXY_INFO_STALE_MS);
			if (!stillStale) {
				fn_clearUdpStatusProbeJob(partyID);
				delete v_udpStatusWatchdogNotifiedAt[partyID];
				continue;
			}

			const misses = Number(probeState.misses || 0) + 1;
			probeState.misses = misses;
			if (misses < UDP_STATUS_STALE_PROBE_MAX_MISSES) {
				probeState.probeAt = now;
				v_udpStatusProbeJobs[partyID] = probeState;
				try {
					js_globals.v_andruavFacade.API_requestUdpProxyStatus(unit);
				} catch {
					// no-op
				}
				fn_diag('udp', 'status_probe_recheck', { partyID: partyID, misses: misses });
				continue;
			}

			const lastAutoRecoveryAt = Number(v_udpStatusAutoRecoveryAt[partyID] || 0);
			if ((now - lastAutoRecoveryAt) < UDP_STATUS_AUTO_RECOVERY_COOLDOWN_MS) {
				continue;
			}
			v_udpStatusAutoRecoveryAt[partyID] = now;
			probeState.lastRecoverAttemptAt = now;
			probeState.misses = 0;
			v_udpStatusProbeJobs[partyID] = probeState;

			const lastNotifiedAt = Number(v_udpStatusWatchdogNotifiedAt[partyID] || 0);
			if ((now - lastNotifiedAt) > UDP_STATUS_STALE_EVENT_COOLDOWN_MS) {
				v_udpStatusWatchdogNotifiedAt[partyID] = now;
				fn_opsHealthAddEvent({
					source: 'udp',
					level: 'warn',
					partyID: partyID,
					message: `${unit.m_unitName || partyID} UDP status stale after probe. Starting automatic recovery.`,
				});
			}

			fn_recoverTelemetry(unit, {
				reason: 'status_stale_auto',
				maxAttempts: UDP_RECOVERY_MAX_ATTEMPTS,
				pollMs: UDP_RECOVERY_POLL_MS,
				force: false,
			});
		}
	}, UDP_STATUS_WATCHDOG_INTERVAL_MS);
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

export async function fn_retryConnectionNow() {
	v_wsReconnectCancelled = false;
	fn_clearWsReconnectTimer();
	if (js_andruav_ws.AndruavClientWS.getSocketStatus() === js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) {
		fn_opsHealthAddEvent({
			source: 'ws',
			level: 'info',
			message: 'Retry WS ignored: already connected'
		});
		return true;
	}
	const email = js_andruavAuth.m_username || js_localStorage.fn_getEmail();
	const accessCode = js_andruavAuth.m_accesscode || js_localStorage.fn_getAccessCode();
	if (!email || !accessCode) {
		fn_dispatchRetryStatus(false, true, 'Missing credentials for reconnect', v_wsReconnectAttempts, 'missing_credentials');
		fn_opsHealthAddEvent({
			source: 'ws',
			level: 'error',
			message: 'Retry WS failed: missing credentials'
		});
		return false;
	}

	v_wsReconnectAttempts = Math.min(v_wsReconnectAttempts + 1, WS_RECONNECT_MAX_ATTEMPTS);
	fn_dispatchRetryStatus(true, false, 'Manual retry requested', v_wsReconnectAttempts, 'manual_retry');
	fn_opsHealthAddEvent({
		source: 'ws',
		level: 'info',
		message: `Manual Retry WS requested (${v_wsReconnectAttempts}/${WS_RECONNECT_MAX_ATTEMPTS})`
	});

	const ok = await fn_login(email, accessCode, false, true);
	if (!ok) {
		fn_dispatchRetryStatus(false, true, 'Manual reconnect failed', v_wsReconnectAttempts, 'manual_retry_failed');
		return false;
	}
	return true;
}

export function fn_cancelConnectionRetry() {
	v_wsReconnectCancelled = true;
	fn_clearWsReconnectTimer();
	fn_dispatchRetryStatus(false, true, 'Reconnect canceled by operator', v_wsReconnectAttempts, 'retry_canceled');
	fn_opsHealthAddEvent({
		source: 'ws',
		level: 'warn',
		message: `Reconnect canceled by operator after attempt ${v_wsReconnectAttempts}/${WS_RECONNECT_MAX_ATTEMPTS}`,
	});
}

export function fn_recoverAllTelemetry() {
	const units = fn_getOnlineVehicleUnits();
	let triggered = 0;
	for (const unit of units) {
		if (!unit) continue;
		fn_recoverTelemetry(unit, {
			reason: 'bulk_recover',
			maxAttempts: UDP_RECOVERY_MAX_ATTEMPTS,
			pollMs: UDP_RECOVERY_POLL_MS,
			force: true,
		});
		triggered += 1;
	}

	fn_opsHealthAddEvent({
		source: 'udp',
		level: triggered > 0 ? 'info' : 'warn',
		message: triggered > 0
			? `Bulk UDP recovery started for ${triggered} vehicle(s)`
			: 'Bulk UDP recovery skipped: no online vehicles',
	});
	fn_opsHealthSyncFromUnits();
	return triggered;
}

export function fn_recoverTelemetry(p_andruavUnit, p_options = {}) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;
	if (js_globals.v_andruavFacade === null || js_globals.v_andruavFacade === undefined) return;
	const partyID = p_andruavUnit.getPartyID();
	if (!partyID) return;

	const maxAttempts = Number.isFinite(p_options.maxAttempts) ? Math.max(1, parseInt(p_options.maxAttempts, 10)) : UDP_RECOVERY_MAX_ATTEMPTS;
	const pollMs = Number.isFinite(p_options.pollMs) ? Math.max(500, parseInt(p_options.pollMs, 10)) : UDP_RECOVERY_POLL_MS;
	const reason = p_options.reason || 'manual';
	const force = p_options.force === true;
	const manualOverride = p_andruavUnit?.m_Telemetry?.m_bridge_manual_override === true;

	// Respect explicit operator telemetry switch actions during automatic recovery triggers.
	if (manualOverride === true && (reason === 'ws_open_auto' || reason === 'unit_online_auto')) {
		return;
	}

	const now = Date.now();
	const lastAt = v_udpRecoveryCooldown[partyID] || 0;

	if (force !== true && (now - lastAt) < UDP_RECOVERY_COOLDOWN_MS) {
		return;
	}
	v_udpRecoveryCooldown[partyID] = now;

	const existingJob = v_udpRecoveryJobs[partyID];
	if (existingJob && force !== true) {
		return;
	}
	if (existingJob && force === true) {
		fn_clearTelemetryRecoveryJob(partyID);
	}

	const runAttempt = (attemptNo) => {
		const liveUnit = js_globals.m_andruavUnitList.fn_getUnit(partyID) || p_andruavUnit;
		if (!liveUnit || liveUnit.m_IsDisconnectedFromGCS === true) {
			fn_clearTelemetryRecoveryJob(partyID);
			fn_clearUdpStatusProbeJob(partyID);
			delete v_udpStatusWatchdogNotifiedAt[partyID];
			return;
		}
		const telemetry = liveUnit.m_Telemetry || {};
		const attemptStartedAt = Date.now();
		const baselineInfoAt = Number(telemetry.m_udpProxy_last_info_at || 0);

		fn_setTelemetryRecoveryState(liveUnit, 'recovering', '', attemptNo, maxAttempts);
		fn_diag('udp', 'recover_attempt', {
			partyID: partyID,
			attempt: attemptNo,
			maxAttempts: maxAttempts,
			reason: reason
		});

		const proxyPort = parseInt(telemetry.m_udpProxy_port || 0, 10);
		if (Number.isFinite(proxyPort) && proxyPort > 0) {
			js_globals.v_andruavFacade.API_setUdpProxyClientPort(liveUnit, proxyPort);
		}
		const currentTelemetryRate = parseInt(telemetry.m_telemetry_level || 0, 10);
		const targetTelemetryRate = (
			Number.isFinite(currentTelemetryRate) && currentTelemetryRate > 0
				? Math.min(3, currentTelemetryRate)
				: 2
		);
		js_globals.v_andruavFacade.API_startTelemetry(liveUnit);
		js_globals.v_andruavFacade.API_resumeTelemetry(liveUnit);
		js_globals.v_andruavFacade.API_adjustTelemetryDataRate(liveUnit, targetTelemetryRate);
		js_globals.v_andruavFacade.API_requestUdpProxyStatus(liveUnit);

		const timer = setTimeout(() => {
			const refreshedUnit = js_globals.m_andruavUnitList.fn_getUnit(partyID) || liveUnit;
			if (!refreshedUnit || refreshedUnit.m_IsDisconnectedFromGCS === true) {
				fn_clearTelemetryRecoveryJob(partyID);
				fn_clearUdpStatusProbeJob(partyID);
				delete v_udpStatusWatchdogNotifiedAt[partyID];
				return;
			}

			js_globals.v_andruavFacade.API_requestUdpProxyStatus(refreshedUnit);
			const refreshedTelemetry = refreshedUnit.m_Telemetry || {};
			const refreshedInfoAt = Number(refreshedTelemetry.m_udpProxy_last_info_at || 0);
			const hasFreshStatus = refreshedInfoAt > baselineInfoAt && refreshedInfoAt >= attemptStartedAt;
			const isActive = refreshedTelemetry.m_udpProxy_active === true;
			const isPaused = refreshedTelemetry.m_udpProxy_paused === true;
			const refreshedPort = parseInt(refreshedTelemetry.m_udpProxy_port || 0, 10);
			const hasValidPort = Number.isFinite(refreshedPort) && refreshedPort > 0;
			const recovered = hasFreshStatus && isActive === true && isPaused !== true && hasValidPort;

			if (recovered) {
				fn_setTelemetryRecoveryState(refreshedUnit, 'idle', '', attemptNo, maxAttempts);
				fn_clearUdpStatusProbeJob(partyID);
				delete v_udpStatusWatchdogNotifiedAt[partyID];
				fn_diag('udp', 'recover_success', {
					partyID: partyID,
					attempt: attemptNo,
					reason: reason,
					proxyPort: refreshedPort,
					telemetryLevel: refreshedTelemetry.m_telemetry_level
				});
				fn_clearTelemetryRecoveryJob(partyID);
				return;
			}

			let failureNote = 'drone-side-inactive';
			if (!hasFreshStatus) {
				failureNote = 'status-stale';
			}
			else if (isActive === true && isPaused === true) {
				failureNote = 'telemetry-paused';
			}
			else if (isActive === true && hasValidPort !== true) {
				failureNote = 'invalid-proxy-port';
			}

			if (attemptNo >= maxAttempts) {
				fn_setTelemetryRecoveryState(refreshedUnit, 'inactive', failureNote, attemptNo, maxAttempts);
				fn_clearUdpStatusProbeJob(partyID);
				fn_diag('udp', 'recover_failed', {
					partyID: partyID,
					attempts: attemptNo,
					reason: reason,
					failureNote: failureNote,
					hasFreshStatus: hasFreshStatus,
					isActive: isActive,
					isPaused: isPaused,
					proxyPort: refreshedPort
				});
				fn_clearTelemetryRecoveryJob(partyID);
				return;
			}

			runAttempt(attemptNo + 1);
		}, pollMs);

		v_udpRecoveryJobs[partyID] = {
			timer: timer,
			reason: reason,
			attempt: attemptNo,
			maxAttempts: maxAttempts
		};
	};

	runAttempt(1);
}

// Websocket Connection established
var EVT_onOpen = function () {
	$('#andruavUnitGlobals').show();

	js_globals.v_connectRetries = 0;
	v_wsReconnectAttempts = 0;
	v_wsReconnectCancelled = false;
	fn_clearWsReconnectTimer();
	fn_diag('ws', 'registered', { retriesReset: true });
	fn_startUdpStatusWatchdog();

	const units = js_globals.m_andruavUnitList.fn_getUnitValues();
	if (units && units.length > 0) {
		for (const unit of units) {
			if (!unit || unit.m_IsGCS === true || unit.m_IsDisconnectedFromGCS === true) continue;
			fn_recoverTelemetry(unit, { reason: 'ws_open_auto', maxAttempts: 1 });
		}
	}
	fn_opsHealthSyncFromUnits();
}

// called when Websocket Closed
var EVT_onClose = function () {
	fn_stopUdpStatusWatchdog();
	const closeReason = v_lastSocketStatusEvent?.closeReason || '';
	const closeCode = v_lastSocketStatusEvent?.closeCode;
	const closeReasonCode = fn_socketReasonCodeFromEvent(v_lastSocketStatusEvent || {}, js_andruavMessages.CONST_SOCKET_STATUS_DISCONNECTED);
	const detailReason = closeReason
		? `WebSocket closed (${closeCode || 'n/a'}): ${closeReason}`
		: `WebSocket closed (${closeCode || 'n/a'})`;
	const deterministicReason = closeReasonCode ? `${detailReason} [${closeReasonCode}]` : detailReason;

	if (js_globals.v_connectState !== true) {
		js_speak.fn_speak('Disconnected');
		fn_diag('ws', 'closed_user_requested', { reason: deterministicReason });
		fn_opsHealthHandleSocketStatus({
			status: js_andruavMessages.CONST_SOCKET_STATUS_DISCONNECTED,
			retrying: false,
			failed: false,
			reason: deterministicReason,
			reasonCode: 'user_disconnect',
			attempt: v_wsReconnectAttempts,
			maxAttempts: WS_RECONNECT_MAX_ATTEMPTS
		});
		return;
	}

	if (v_wsReconnectCancelled === true) {
		fn_dispatchRetryStatus(false, true, 'Reconnect canceled by operator', v_wsReconnectAttempts, 'retry_canceled');
		fn_diag('ws', 'reconnect_canceled', {
			attempt: v_wsReconnectAttempts,
			reason: deterministicReason
		});
		return;
	}

	if (v_wsReconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
		fn_dispatchRetryStatus(false, true, `Reconnect attempts exhausted. ${deterministicReason}`, v_wsReconnectAttempts, 'retries_exhausted');
		js_speak.fn_speak('Disconnected');
		fn_diag('ws', 'reconnect_exhausted', {
			attempts: v_wsReconnectAttempts,
			maxAttempts: WS_RECONNECT_MAX_ATTEMPTS,
			reason: deterministicReason
		});
		return;
	}

	v_wsReconnectAttempts += 1;
	const delayMs = WS_RECONNECT_BASE_DELAY_MS * v_wsReconnectAttempts;
	fn_dispatchRetryStatus(true, false, `Retrying connection. ${deterministicReason}`, v_wsReconnectAttempts, 'retry_scheduled');
	fn_diag('ws', 'reconnect_scheduled', {
		attempt: v_wsReconnectAttempts,
		delayMs: delayMs,
		reason: deterministicReason
	});
	fn_clearWsReconnectTimer();
	v_wsReconnectTimer = setTimeout(async function () {
		v_wsReconnectTimer = null;
		const email = js_andruavAuth.m_username || js_localStorage.fn_getEmail();
		const accessCode = js_andruavAuth.m_accesscode || js_localStorage.fn_getAccessCode();
		if (!email || !accessCode) {
			fn_dispatchRetryStatus(false, true, 'Missing credentials for reconnect', v_wsReconnectAttempts, 'missing_credentials');
			fn_diag('ws', 'reconnect_aborted_missing_credentials', {});
			return;
		}

		const ok = await fn_login(email, accessCode, false, true);
		if (!ok) {
			fn_diag('auth', 'reconnect_login_failed', { attempt: v_wsReconnectAttempts });
			if (v_wsReconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
				fn_dispatchRetryStatus(false, true, 'Reconnect failed after retries', v_wsReconnectAttempts, 'reconnect_failed');
			} else {
				EVT_onClose();
			}
		}
	}, delayMs);
};



function fn_onSocketStatus(me, event) {
	v_lastSocketStatusEvent = event;
	const status = event.status;
	const reason = event.reason || event.closeReason || event.errorKind || '';
	const reasonCode = fn_socketReasonCodeFromEvent(event, status);
	const enrichedEvent = {
		...event,
		reason: reason,
		reasonCode: reasonCode,
		retrying: event.retrying === true,
		failed: event.failed === true,
		attempt: Number.isFinite(event.attempt) ? event.attempt : v_wsReconnectAttempts,
		maxAttempts: Number.isFinite(event.maxAttempts) ? event.maxAttempts : WS_RECONNECT_MAX_ATTEMPTS
	};
	fn_opsHealthHandleSocketStatus(enrichedEvent);
	js_eventEmitter.fn_dispatch(js_event.EE_onSocketStatus, enrichedEvent);

	if (status === js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) {
		js_speak.fn_speak('Connected');
		fn_diag('ws', 'socket_status_registered', {});

		if (js_globals.CONST_MAP_EDITOR === true) {
			js_globals.v_andruavFacade.API_loadGeoFence(js_andruavAuth.m_username, js_globals.v_andruavWS.m_groupName, null, '_drone_', 1);
		}
	}
};

export function fn_requestWayPoints(p_andruavUnit, fromFCB) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return false;
	const partyID = p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : null;
	const fromFlightController = fromFCB === true;
	if (fromFlightController === true && fn_tryMissionReadLock(partyID) !== true) {
		return false;
	}
	if (partyID && js_globals.v_waypointsCache.hasOwnProperty(partyID) === true) {
		delete js_globals.v_waypointsCache[partyID];
	}
	if (partyID) {
		fn_missionIntegrityMarkReadRequested(partyID, p_andruavUnit.m_unitName || partyID);
		fn_opsHealthAddEvent({
			source: 'mission',
			level: 'info',
			partyID: partyID,
			message: `Mission read requested for ${p_andruavUnit.m_unitName || partyID}`
		});
	}
	if (fromFlightController === true) {
		// Ensure old mission does not remain visible while reading latest mission from FCB.
		deleteWayPointsofDrone(p_andruavUnit, []);
		js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, p_andruavUnit);
	}
	const waypointRequestSent = js_globals.v_andruavFacade.API_requestWayPoints(p_andruavUnit, fromFCB);
	if (waypointRequestSent === false) {
		if (fromFlightController === true) {
			fn_clearMissionReadLock(partyID);
		}
		return false;
	}
	js_globals.v_andruavFacade.API_do_GetHomeLocation(p_andruavUnit);
	js_globals.v_andruavFacade.API_requestGeoFencesAttachStatus(p_andruavUnit);
	return true;
}

export function fn_clearWayPoints(p_andruavUnit) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	fn_do_modal_confirmation("Delete Mission for " + p_andruavUnit.m_unitName,
		"Are you sure you want to delete mission & geo-fences", function (p_approved) {
			if (p_approved === false) return;
			fn_missionIntegrityMarkDroneMutationExpected(
				p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
				'remote_delete_requested',
				p_andruavUnit.m_unitName || ''
			);
			fn_opsHealthAddEvent({
				source: 'mission',
				level: 'warn',
				partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
				message: `Mission marked stale for ${p_andruavUnit.m_unitName || 'unit'} (remote delete requested)`
			});
			js_globals.v_andruavFacade.API_requestDeleteWayPoints(p_andruavUnit);
			js_globals.v_andruavFacade.API_requestDeleteFenceByName(p_andruavUnit);
		}, "YES", "bg-danger text-white");
}

export function fn_clearWayPointsFromMap(p_andruavUnit) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) return;
	const partyID = p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '';
	if (partyID && v_missionReadLocks[partyID] === true) {
		return false;
	}

	deleteWayPointsofDrone(p_andruavUnit, []);
	if (p_andruavUnit.getPartyID) {
		fn_missionIntegrityMarkMapCleared(p_andruavUnit.getPartyID(), p_andruavUnit.m_unitName || '');
		fn_opsHealthAddEvent({
			source: 'mission',
			level: 'warn',
			partyID: p_andruavUnit.getPartyID(),
			message: `Mission map cleared for ${p_andruavUnit.m_unitName || 'unit'}`
		});
	}
	js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, p_andruavUnit);
	return true;
}


export function fn_readMissionFile(p_mission, p_andruavUnit) {
	if (p_mission === null || p_mission === undefined) return;

	if (!selectedMissionFilesToRead.length) {
		alert('Please select a file!');
		return;
	}

	const file = selectedMissionFilesToRead[0];


	const is_de_file = (file.name.indexOf(js_globals.v_mission_file_extension) !== -1);
	const reader = new FileReader();

	// If we use onloadend, we need to check the readyState.
	reader.onloadend = function (evt) {
		if (evt.target.readyState === FileReader.DONE) { // DONE == 2
			try {
				const plan_text = new TextDecoder("utf-8").decode(evt.target.result); // Convert to string
				if (is_de_file === true) {
					p_mission.fn_importAsDE_V1(p_andruavUnit, JSON.parse(plan_text));
				}
				else {
					alert('Please select a valid file!');
				}

			}
			catch (e) {
				alert('Please select a valid file!');
			}

		}
	};

	if (js_globals.v_andruavClient === null || js_globals.v_andruavClient === undefined) return;

	reader.readAsArrayBuffer(file);
}

export function fn_putWayPoints_direct(p_andruavUnit, p_eraseFirst, p_files) {

	if (p_andruavUnit === null || p_andruavUnit === undefined) return;

	if (!p_files.length) {
		alert('Please select a file!');
		return;
	}

	const file = p_files[0];

	const is_de_file = (file.name.indexOf(js_globals.v_mission_file_extension) !== -1);
	const reader = new FileReader();

	// If we use onloadend, we need to check the readyState.
	reader.onloadend = function (evt) {
		if (evt.target.readyState === FileReader.DONE) { // DONE == 2
			try {
				const plan_text = new TextDecoder("utf-8").decode(evt.target.result); // Convert to string
				if (is_de_file === true) {
					fn_missionIntegrityMarkDroneMutationExpected(
						p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
						'mission_upload_requested',
						p_andruavUnit.m_unitName || ''
					);
					fn_opsHealthAddEvent({
						source: 'mission',
						level: 'warn',
						partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
						message: `Mission marked stale for ${p_andruavUnit.m_unitName || 'unit'} (upload requested)`
					});
					js_globals.v_andruavFacade.API_uploadDEMission(p_andruavUnit, p_eraseFirst, JSON.parse(plan_text));
				}
				else {
					fn_missionIntegrityMarkDroneMutationExpected(
						p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
						'mission_upload_requested',
						p_andruavUnit.m_unitName || ''
					);
					fn_opsHealthAddEvent({
						source: 'mission',
						level: 'warn',
						partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
						message: `Mission marked stale for ${p_andruavUnit.m_unitName || 'unit'} (upload requested)`
					});
					js_globals.v_andruavFacade.API_uploadWayPoints(p_andruavUnit, p_eraseFirst, plan_text);
				}

			}
			catch {
				//TODO:  failed to upload Mission
			}

		}
	};

	if (js_globals.v_andruavClient === null || js_globals.v_andruavClient === undefined) return;

	reader.readAsArrayBuffer(file);
}


var EVT_onDeleted = function () {
	if (js_globals.v_andruavWS) {
		js_globals.v_andruavWS.fn_disconnect();
	}
	fn_stopUdpStatusWatchdog();
	fn_clearWsReconnectTimer();
	fn_clearGpsRenderJobs();
	Object.keys(v_udpRecoveryJobs).forEach(fn_clearTelemetryRecoveryJob);
	Object.keys(v_udpStatusWatchdogNotifiedAt).forEach((partyID) => delete v_udpStatusWatchdogNotifiedAt[partyID]);
	Object.keys(v_udpRecoveryCooldown).forEach((partyID) => delete v_udpRecoveryCooldown[partyID]);
	Object.keys(v_udpStatusProbeJobs).forEach((partyID) => delete v_udpStatusProbeJobs[partyID]);
	Object.keys(v_udpStatusAutoRecoveryAt).forEach((partyID) => delete v_udpStatusAutoRecoveryAt[partyID]);
	js_globals.v_andruavClient = null;
	js_globals.v_andruavFacade = null;
	js_globals.v_andruavWS = null;
	fn_opsHealthSyncFromUnits();
	fn_uiStateReset();
	fn_uiAlertsReset();
	fn_missionIntegrityReset();
	fn_commandFeedbackReset();
	Object.keys(v_missionReadLockTimers).forEach((partyID) => fn_clearMissionReadLock(partyID));

};

function EVT_unitOnlineChanged(me, p_andruavUnit) {
	if (!p_andruavUnit) return;
	if (p_andruavUnit.m_IsGCS === true) return;
	if (p_andruavUnit.m_IsDisconnectedFromGCS === true) return;
	const partyID = p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '';
	if (partyID) {
		delete v_udpStatusWatchdogNotifiedAt[partyID];
		fn_clearUdpStatusProbeJob(partyID);
		delete v_udpStatusAutoRecoveryAt[partyID];
	}
	fn_recoverTelemetry(p_andruavUnit, { reason: 'unit_online_auto', maxAttempts: 1 });
	fn_opsHealthSyncFromUnits();
	fn_applyUIFocusRendering();
	fn_applyMissionLayerStylesAll();
}

function EVT_unitHighlightedUI(me, p_andruavUnit) {
	if (!p_andruavUnit || typeof p_andruavUnit.getPartyID !== 'function') return;
	fn_setUIActiveUnit(p_andruavUnit.getPartyID());
	fn_applyUIFocusRendering();
}

function EVT_uiFocusChanged() {
	fn_applyUIFocusRendering();
}

function EVT_uiMissionLayerChanged() {
	fn_applyMissionLayerStylesAll();
}

function EVT_onProxyInfoUpdated(me, p_andruavUnit) {
	if (!p_andruavUnit || p_andruavUnit.m_IsGCS === true) return;
	fn_opsHealthHandleProxyInfo(p_andruavUnit);
}

function EVT_onVideoStreamStartedOps(me, data) {
	const unit = data?.andruavUnit;
	if (!unit || typeof unit.getPartyID !== 'function') return;
	fn_opsHealthHandleVideoState(unit.getPartyID(), true, unit.m_unitName || '');
}

function EVT_onVideoStreamStoppedOps(me, data) {
	const unit = data?.andruavUnit;
	if (!unit || typeof unit.getPartyID !== 'function') return;
	fn_opsHealthHandleVideoState(unit.getPartyID(), false, unit.m_unitName || '');
}



var EVT_msgFromUnit_WayPointsUpdated = function (me, data) {

	// Live update is not allowed in Map Editor
	if (js_globals.CONST_MAP_EDITOR === true) return;

	const p_andruavUnit = data.unit;
	const missionIndexReached = data.mir;
	const status = data.status;

	if (p_andruavUnit.m_wayPoint === null || p_andruavUnit.m_wayPoint === undefined) {
		//no waypoint attached ... send asking for update
		js_globals.v_andruavFacade.API_requestWayPoints(p_andruavUnit);

		return;
	}

	if (p_andruavUnit.m_gui.m_wayPoint_markers !== null && p_andruavUnit.m_gui.m_wayPoint_markers !== undefined) {
		const c_mission_index = missionIndexReached;
		var v_marker = p_andruavUnit.m_gui.m_wayPoint_markers[c_mission_index];
		if (v_marker !== null && v_marker !== undefined) {
			v_marker.waypoint_status = status;
			if ((p_andruavUnit.m_wayPoint.wayPointPath[c_mission_index] === js_andruavMessages.CONST_WayPoint_TYPE_CAMERA_TRIGGER)
				|| (p_andruavUnit.m_wayPoint.wayPointPath[c_mission_index] === js_andruavMessages.CONST_WayPoint_TYPE_CAMERA_CONTROL)) {
				switch (status) {
					case js_andruavMessages.CONST_Report_NAV_ItemReached:
						js_leafletmap.fn_setVehicleIcon(v_marker, '/images/camera_24x24.png', null, null, false, false, null, [16, 16]);
						break;
					case js_andruavMessages.CONST_Report_NAV_ItemUnknown:
						js_leafletmap.fn_setVehicleIcon(v_marker, '/images/camera_gy_32x32.png', null, null, false, false, null, [16, 16]);
						break;
					case js_andruavMessages.CONST_Report_NAV_ItemExecuting:
						js_leafletmap.fn_setVehicleIcon(v_marker, '/images/camera_bg_32x32.png', null, null, false, false, null, [16, 16]);
						break;
				}
			}
			else {
				switch (status) {
					case js_andruavMessages.CONST_Report_NAV_ItemReached:
						p_andruavUnit.m_Nav_Info._Target.wp_num = c_mission_index + 1;
						js_leafletmap.fn_setVehicleIcon(v_marker, '/images/location_gy_32x32.png', null, [16, 24], false, false, null, [32, 32]);
						break;
					case js_andruavMessages.CONST_Report_NAV_ItemUnknown:
						js_leafletmap.fn_setVehicleIcon(v_marker, '/images/location_bb_32x32.png', null, [16, 24], false, false, null, [32, 32]);
						break;
					case js_andruavMessages.CONST_Report_NAV_ItemExecuting:
						js_leafletmap.fn_setVehicleIcon(v_marker, '/images/location_bg_32x32.png', null, [16, 24], false, false, null, [32, 32]);
						break;

				}
			}
		}
	}
	fn_applyMissionLayerStyleForUnit(p_andruavUnit);
}

var EVT_msgFromUnit_WayPoints = function (me, data) {

	// dont upload waypoints in map editor mode. -- for now TEMP
	if (js_globals.CONST_MAP_EDITOR) return;

	const p_andruavUnit = data.unit;
	const wayPointArray = data.wps;
	const partyID = p_andruavUnit && p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '';
	if (partyID) {
		fn_clearMissionReadLock(partyID);
	}


	// TODO HERE >>> DELETE OLD WAYPOINTS AND HIDE THEM FROM MAP
	var LngLatPoints = [];

	deleteWayPointsofDrone(p_andruavUnit, wayPointArray);

	if (wayPointArray.length === 0) {
		fn_missionIntegrityUpdateFromDroneMission(
			p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
			p_andruavUnit.m_unitName || '',
			[]
		);
		fn_opsHealthAddEvent({
			source: 'mission',
			level: 'info',
			partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
			message: `Mission sync complete for ${p_andruavUnit.m_unitName || 'unit'} (empty mission)`
		});
		return;
	}
	let latlng = null;
	for (let i = 0; i < wayPointArray.length; ++i) {
		let subIcon = false;
		let wayPointStep = wayPointArray[i];
		let icon_img = '/images/location_bb_32x32.png';
		switch (wayPointStep.waypointType) {
			case js_andruavMessages.CONST_WayPoint_TYPE_WAYPOINTSTEP:
				latlng = js_leafletmap.fn_getLocationObjectBy_latlng(wayPointStep.Latitude, wayPointStep.Longitude);
				icon_img = '/images/location_bb_32x32.png';
				wayPointStep.m_label = "WP";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_SPLINE:
				latlng = js_leafletmap.fn_getLocationObjectBy_latlng(wayPointStep.Latitude, wayPointStep.Longitude);
				icon_img = '/images/location_bb_32x32.png';
				wayPointStep.m_label = "Spline";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_TAKEOFF:
				wayPointStep.m_label = "Takeoff";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_LANDING:
				wayPointStep.m_label = "Land";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_GUIDED:
				wayPointStep.m_label = "Guided";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_RTL:
				wayPointStep.m_label = "RTL";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_CAMERA_TRIGGER:
				latlng = js_leafletmap.fn_getLocationObjectBy_latlng(latlng.lat + 0.00001, latlng.lng + 0.00001);
				icon_img = '/images/camera_gy_32x32.png';
				subIcon = true;
				wayPointStep.m_label = "CAM";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_CAMERA_CONTROL:
				latlng = js_leafletmap.fn_getLocationObjectBy_latlng(latlng.lat + 0.00001, latlng.lng + 0.00001);
				icon_img = '/images/camera_gy_32x32.png';
				subIcon = true;
				wayPointStep.m_label = "CAM";
				break;
			case js_andruavMessages.CONST_WayPoint_TYPE_CIRCLE:
				latlng = js_leafletmap.fn_getLocationObjectBy_latlng(wayPointStep.Latitude, wayPointStep.Longitude);
				icon_img = '/images/location_bb_32x32.png';
				wayPointStep.m_label = "Loiter in Circles";
				var v_circleMission = js_leafletmap.fn_drawMissionCircle(latlng, wayPointStep.m_Radius);
				// var circleMission = new google.maps.Circle({
				// 	fillColor: '#3232CD',
				// 	strokeOpacity: 1.0,
				// 	strokeWeight: 0,
				// 	map: map,
				// 	fillOpacity: 0.25,
				// 	center: latlng,
				// 	radius: parseInt(wayPointStep.m_Radius)
				// });
				// circleMission.setMap(map);
				p_andruavUnit.m_gui.m_wayPoint_polygons.push(v_circleMission);
				break;
			default:
				continue;

		}


		if (latlng !== null && latlng !== undefined) {
			let v_iconsize = [32, 32];
			if (subIcon === true) {
				v_iconsize = [16, 16];
			}
			let v_mark = js_leafletmap.fn_CreateMarker(icon_img, p_andruavUnit.m_unitName + "  step: " + wayPointStep.m_Sequence, [16, 24], false, false, null, v_iconsize);
			js_leafletmap.fn_setPosition(v_mark, latlng);
			p_andruavUnit.m_gui.m_wayPoint_markers.push(v_mark);
			v_mark.wayPointStep = wayPointStep;

			if (js_globals.CONST_MAP_EDITOR) {
				// add to shapes list.
				v_mark.pm.m_shape_type = 'Marker';
				v_mark.on('click', function (p_event) {
					if (p_event.originalEvent.ctrlKey === false) {
						js_eventEmitter.fn_dispatch(js_event.EE_onShapeSelected, p_event.target);
					}
					else {
						js_eventEmitter.fn_dispatch(js_event.EE_onShapeDeleted, p_event);
					}
				});
				js_eventEmitter.fn_dispatch(js_event.EE_onShapeCreated, v_mark)
				js_globals.v_map_shapes.push(v_mark);

			}


			function fn_clickHandler(p_wayPointStep, p_andruavUnit) {
				js_leafletmap.fn_addListenerOnClickMarker(v_mark,
					function (p_lat, p_lng) {
						fn_generateContextMenuHTML_MissionItem(p_lat, p_lng, p_wayPointStep, p_andruavUnit);
					});
			}

			fn_clickHandler(wayPointStep, p_andruavUnit);

			if (subIcon === false) {
				LngLatPoints.push(latlng);
			}
		}


	}

	if (LngLatPoints.length > 0) {
		p_andruavUnit.m_wayPoint.polylines = js_leafletmap.fn_drawMissionPolyline(LngLatPoints, js_globals.flightPath_colors[p_andruavUnit.m_index % 4]);
	}
	fn_missionIntegrityUpdateFromDroneMission(
		p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
		p_andruavUnit.m_unitName || '',
		wayPointArray
	);
	fn_opsHealthAddEvent({
		source: 'mission',
		level: 'info',
		partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
		message: `Mission sync complete for ${p_andruavUnit.m_unitName || 'unit'} (${wayPointArray.length} items)`
	});
	fn_applyMissionLayerStyleForUnit(p_andruavUnit);
}



function EVT_andruavUnitFCBUpdated(me, p_andruavUnit) {
	if (p_andruavUnit.m_useFCBIMU === true) {
		js_speak.fn_speak(p_andruavUnit.m_unitName + ' connected to flying board');
		if (js_globals.CONST_MAP_EDITOR !== true) {
			fn_requestWayPoints(p_andruavUnit, true);
		}
	}
	else {
		js_speak.fn_speak(p_andruavUnit.m_unitName + ' disconnected from flying board');
	}
}

function EVT_andruavUnitFlyingUpdated(me, p_andruavUnit) {
	if (p_andruavUnit.m_isFlying === true) {
		js_speak.fn_speak(p_andruavUnit.m_unitName + ' is Flying');
		fn_uiAlertsAdd({
			level: 'warn',
			source: 'flight',
			partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
			message: `${p_andruavUnit.m_unitName} is flying`
		});
	}
	else {
		js_speak.fn_speak(p_andruavUnit.m_unitName + ' is on ground');
		fn_uiAlertsAdd({
			level: 'info',
			source: 'flight',
			partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
			message: `${p_andruavUnit.m_unitName} is on ground`
		});
	}
	fn_refreshVehicleMarkerIcon(p_andruavUnit, true);
	js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, p_andruavUnit);
}




function EVT_andruavUnitFightModeUpdated(me, p_andruavUnit) {
	if (p_andruavUnit.m_IsGCS !== true) {
		const text = hlp_getFlightMode(p_andruavUnit);
		js_speak.fn_speak(p_andruavUnit.m_unitName + ' flight mode is ' + text);
	}
}


function changedeg(element, degree) {
	if (navigator.userAgent.match("Chrome")) {
		element.style.WebkitTransform = "rotate(" + degree + "deg)";
	}
	else if (navigator.userAgent.match("Firefox")) {
		element.style.MozTransform = "rotate(" + degree + "deg)";
	}
	else if (navigator.userAgent.match("MSIE")) {
		element.style.msTransform = "rotate(" + degree + "deg)";
	}
	else if (navigator.userAgent.match("Opera")) {
		element.style.OTransform = "rotate(" + degree + "deg)";
	}
	else {
		element.style.transform = "rotate(" + degree + "deg)";
	}
}

function EVT_andruavUnitVehicleTypeUpdated(me, p_andruavUnit) {
	fn_refreshVehicleMarkerIcon(p_andruavUnit, true);
}


function EVT_andruavUnitSDRTrigger(me, p_andruavUnit) {
	const detected_signal = p_andruavUnit.m_SDR.getLastDetectedSignal();
	if (detected_signal === null || detected_signal === undefined) return;
	//const v_htmlTitle = "<p class='text-white margin_zero fs-6'>" + detected_signal.frequency + 
	//"</p> <p class='text-white margin_zero fs-6'>" + detected_signal.signal_value + "</p>";
	const v_marker = js_leafletmap.fn_CreateMarker('/images/signal_r_32.png', 'image');
	const latlng = js_leafletmap.fn_getLocationObjectBy_latlng(detected_signal.latitude, detected_signal.longitude);
	js_leafletmap.fn_setPosition(v_marker, latlng);
}


function EVT_andruavUnitArmedUpdated(me, p_andruavUnit) {

	if (p_andruavUnit.m_isArmed) {
		js_speak.fn_speak('ARMED');
		fn_uiAlertsAdd({
			level: 'warn',
			source: 'arm',
			partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
			message: `${p_andruavUnit.m_unitName} armed`
		});
	}
	else {
		js_speak.fn_speak('Disarmed');
		fn_uiAlertsAdd({
			level: 'info',
			source: 'arm',
			partyID: p_andruavUnit.getPartyID ? p_andruavUnit.getPartyID() : '',
			message: `${p_andruavUnit.m_unitName} disarmed`
		});
	}

	fn_refreshVehicleMarkerIcon(p_andruavUnit, true);
	js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, p_andruavUnit);
}


function getDestinationPointIcon(p_andruavUnit) {
	const c_point_type = p_andruavUnit.m_Geo_Tags.p_DestinationPoint.type;
	const c_vehicle_index = p_andruavUnit.m_index % 4;
	switch (c_point_type) {
		case js_andruavMessages.CONST_DESTINATION_GUIDED_POINT:
			return '/images/destination_bg_32x32.png';
		case js_andruavMessages.CONST_DESTINATION_SWARM_MY_LOCATION:
			{
				switch (p_andruavUnit.m_VehicleType) {
					case js_andruavUnit.VEHICLE_PLANE:
						return js_globals.swarm_plane_location_icon[c_vehicle_index];
					case js_andruavUnit.VEHICLE_TRI:
					case js_andruavUnit.VEHICLE_QUAD:
					case js_andruavUnit.VEHICLE_VTOL:
					case js_andruavUnit.VEHICLE_ROVER:
					default:
						return js_globals.swarm_quad_location_icon[c_vehicle_index];
				}
		}
	}
}

const g_vehicleArrowIconCache = new Map();

// QGroundControl vehicleArrowOpaque.svg shape, recolored per connected unit.
const VEHICLE_ARROW_SVG_TEMPLATE = `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 72 72"><path d="M35.5 2.118v51.573L1.118 70.882z" fill="__PRIMARY__"/><path d="M35 4.236v49.146L2.236 69.764zM36 0 0 72l36-18z" fill="__ACCENT__"/><path d="M36.5 53.691V2.118l34.382 68.764z" fill="__SECONDARY__"/><path d="m37 4.236 32.764 65.528L37 53.382zM36 0v54l36 18z" fill="__ACCENT__"/></svg>`;

function fn_getColoredVehicleArrowIcon(p_andruavUnit) {
	const colorKey = fn_getUnitColorKey(p_andruavUnit);
	if (g_vehicleArrowIconCache.has(colorKey)) {
		return g_vehicleArrowIconCache.get(colorKey);
	}

	const colors = fn_getUnitColorPalette(p_andruavUnit);
	const svg = VEHICLE_ARROW_SVG_TEMPLATE
		.replace(/__PRIMARY__/g, colors.primary)
		.replace(/__SECONDARY__/g, colors.secondary)
		.replace(/__ACCENT__/g, colors.accent);
	const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
	g_vehicleArrowIconCache.set(colorKey, dataUri);
	return dataUri;
}


export function getVehicleIcon(p_andruavUnit, applyBearing) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) {
		return '/images/drone_3_32x32.png';
	}
	if (p_andruavUnit.m_IsGCS === true) {
		return '/images/map_gcs_3_32x32.png';
	} else {
		switch (p_andruavUnit.m_VehicleType) {
			case js_andruavUnit.VEHICLE_TRI:
				p_andruavUnit.m_VehicleType_TXT = "Tricopter";
				break;
			case js_andruavUnit.VEHICLE_QUAD:
				p_andruavUnit.m_VehicleType_TXT = "Quadcopter";
				break;
			case js_andruavUnit.VEHICLE_VTOL:
				p_andruavUnit.m_VehicleType_TXT = "VTOL Wings";
				break;
			case js_andruavUnit.VEHICLE_PLANE:
				p_andruavUnit.m_VehicleType_TXT = "Fixed Wings";
				break;
			case js_andruavUnit.VEHICLE_HELI:
				p_andruavUnit.m_VehicleType_TXT = "Heli";
				break;
			case js_andruavUnit.VEHICLE_ROVER:
				p_andruavUnit.m_VehicleType_TXT = "Rover";
				break;
			case js_andruavUnit.VEHICLE_BOAT:
				p_andruavUnit.m_VehicleType_TXT = "Boat";
				break;
			case js_andruavUnit.VEHICLE_SUBMARINE:
				p_andruavUnit.m_VehicleType_TXT = "Submarine";
				break;
			case js_andruavUnit.CONTROL_UNIT:
				p_andruavUnit.m_VehicleType_TXT = "Control Unit";
				break;
			default:
				p_andruavUnit.m_VehicleType_TXT = "Vehicle";
				break;
		}
		return fn_getColoredVehicleArrowIcon(p_andruavUnit);
	}
}

export function fn_getUnitThemeColor(p_andruavUnit) {
	return fn_getUnitColorPalette(p_andruavUnit);
}

function fn_refreshVehicleMarkerIcon(p_andruavUnit, force = false) {
	if (!p_andruavUnit || !p_andruavUnit.m_gui || !p_andruavUnit.m_gui.m_marker) return;

	try {
		const marker = p_andruavUnit.m_gui.m_marker;
		const nextIconUrl = getVehicleIcon(p_andruavUnit, (js_globals.CONST_MAP_GOOLE === true));
		if (!nextIconUrl) return;

		const prevIconUrl =
			(p_andruavUnit.m_gui.m_marker_icon_url || '')
			|| (marker?.options?.icon?.options?.iconUrl || '')
			|| '';

		if (force !== true && prevIconUrl === nextIconUrl) {
			return;
		}

		const v_htmlTitle = `<p class='text-white margin_zero fs-6'>${p_andruavUnit.m_unitName || ''}</p>`;
		js_leafletmap.fn_setVehicleIcon(
			marker,
			nextIconUrl,
			p_andruavUnit.m_unitName,
			null,
			false,
			false,
			v_htmlTitle,
			[64, 64]
		);
		p_andruavUnit.m_gui.m_marker_icon_url = nextIconUrl;
	} catch (error) {
		console.warn('[MAP] failed to refresh vehicle marker icon', {
			partyID: p_andruavUnit?.getPartyID ? p_andruavUnit.getPartyID() : '',
			err: error?.message || error
		});
	}
}

/**
   Called when message [js_andruavMessages.CONST_TYPE_AndruavMessage_GPS] is received from a UNIT or GCS holding IMU Statistics
 */
function EVT_msgFromUnit_GPS(me, p_andruavUnit) {
	function getLabel() {
		return p_andruavUnit.m_unitName;
	}


	if ((p_andruavUnit.m_defined === true) && (p_andruavUnit.m_Nav_Info.p_Location.lat !== null && p_andruavUnit.m_Nav_Info.p_Location.lat !== undefined)) {

		if (p_andruavUnit.m_gui.m_marker === null || p_andruavUnit.m_gui.m_marker === undefined) {
			if (js_globals.v_vehicle_gui[p_andruavUnit.getPartyID()] !== null && js_globals.v_vehicle_gui[p_andruavUnit.getPartyID()] !== undefined) {
				p_andruavUnit.m_gui = js_globals.v_vehicle_gui[p_andruavUnit.getPartyID()];
			}
		}

		let marker = p_andruavUnit.m_gui.m_marker;

		if (js_globals.CONST_DISABLE_ADSG === false) {
			js_adsbUnit.fn_getADSBDataForUnit(p_andruavUnit);
		}

		let v_image = getVehicleIcon(p_andruavUnit, (js_globals.CONST_MAP_GOOLE === true));

		if (marker === null || marker === undefined) {
			// create a buffer for flight path
			p_andruavUnit.m_gui.m_gui_flightPath.fn_flush();
			p_andruavUnit.m_gui.m_flightPath_style = {
				color: js_globals.flightPath_colors[p_andruavUnit.m_index % 4],
				opacity: 0.8,
				weight: 5,
				dashArray: '5, 5'

			};


			/*
				v_htmlTitle: Valid only for Leaflet
			*/
			const v_htmlTitle = "<p class='text-white margin_zero fs-6'>" + p_andruavUnit.m_unitName + "</p>";
			// Add new Vehicle
			p_andruavUnit.m_gui.m_marker = js_leafletmap.fn_CreateMarker(v_image, getLabel(), null, false, false, v_htmlTitle, [64, 64]);
			p_andruavUnit.m_gui.m_marker_icon_url = v_image;
			js_globals.v_vehicle_gui[p_andruavUnit.getPartyID()] = p_andruavUnit.m_gui;

			js_leafletmap.fn_addListenerOnClickMarker(p_andruavUnit.m_gui.m_marker,
				function (p_lat, p_lng) {

					js_eventEmitter.fn_dispatch(js_event.EE_unitHighlighted, p_andruavUnit);

					fn_generateContextMenuHTML_MainUnitPopup(p_lat, p_lng, p_andruavUnit, true);


				});

			js_leafletmap.fn_addListenerOnMouseOverMarker(p_andruavUnit.m_gui.m_marker,
				function (p_lat, p_lng) {

					if (info_unit_context_popup !== null) return;


					let clickTimer = setTimeout(() => {
						fn_generateContextMenuHTML_MainUnitPopup(p_lat, p_lng, p_andruavUnit, false);
					}, 200);

					// pointer is over then register in event mouseOut
					js_leafletmap.fn_addListenerOnMouseOutMarker(p_andruavUnit.m_gui.m_marker,
						function (p_lat, p_lng) {
							// pointer is out then deregister in mouse-out event.
							js_leafletmap.fn_removeListenerOnMouseOutClickMarker(p_andruavUnit.m_gui.m_marker);
							clearTimeout(clickTimer);
							if ((info_unit_context_popup == null) || (!info_unit_context_popup.hasOwnProperty('m_ignoreMouseOut')) || (info_unit_context_popup.m_ignoreMouseOut !== true)) {
								// hide me if marked hide.
								js_leafletmap.fn_hideInfoWindow(info_unit_context_popup);
								info_unit_context_popup = null;
							}
						});




				});
		}
		else {
			// DRAW path
			if (p_andruavUnit.m_Nav_Info.p_Location.oldlat !== null && p_andruavUnit.m_Nav_Info.p_Location.oldlat !== undefined) {
				const v_distance = js_helpers.fn_calcDistance(
					p_andruavUnit.m_Nav_Info.p_Location.oldlat,
					p_andruavUnit.m_Nav_Info.p_Location.oldlng,
					p_andruavUnit.m_Nav_Info.p_Location.lat,
					p_andruavUnit.m_Nav_Info.p_Location.lng);
				if (v_distance > 1000) {
					p_andruavUnit.m_Nav_Info.p_Location.oldlat = p_andruavUnit.m_Nav_Info.p_Location.lat;
					p_andruavUnit.m_Nav_Info.p_Location.oldlng = p_andruavUnit.m_Nav_Info.p_Location.lng;
					p_andruavUnit.m_Nav_Info.p_Location.oldalt = p_andruavUnit.m_Nav_Info.p_Location.alt_relative;
				}
				else if (v_distance > 10) {
					const v_flightPath = js_leafletmap.fn_DrawPath(
						p_andruavUnit.m_Nav_Info.p_Location.oldlat,
						p_andruavUnit.m_Nav_Info.p_Location.oldlng,
						p_andruavUnit.m_Nav_Info.p_Location.lat,
						p_andruavUnit.m_Nav_Info.p_Location.lng,
						p_andruavUnit.m_gui.m_flightPath_style);

					// Add flight path step
					p_andruavUnit.m_gui.m_gui_flightPath.fn_add(v_flightPath, true,
						function (oldstep) {
							js_leafletmap.fn_hideItem(oldstep);
						});


					p_andruavUnit.m_Nav_Info.m_FlightPath.push(v_flightPath);
					p_andruavUnit.m_Nav_Info.p_Location.oldlat = p_andruavUnit.m_Nav_Info.p_Location.lat;
					p_andruavUnit.m_Nav_Info.p_Location.oldlng = p_andruavUnit.m_Nav_Info.p_Location.lng;
					p_andruavUnit.m_Nav_Info.p_Location.oldalt = p_andruavUnit.m_Nav_Info.p_Location.alt_relative;
				}
			}
			else {
				p_andruavUnit.m_Nav_Info.p_Location.oldlat = p_andruavUnit.m_Nav_Info.p_Location.lat;
				p_andruavUnit.m_Nav_Info.p_Location.oldlng = p_andruavUnit.m_Nav_Info.p_Location.lng;
				p_andruavUnit.m_Nav_Info.p_Location.oldalt = p_andruavUnit.m_Nav_Info.p_Location.alt_relative;
			}


		}

		fn_scheduleGpsMarkerRender(p_andruavUnit);
	}
	else {

	}
}


/**
 Called when message [js_andruavMessages.CONST_TYPE_AndruavMessage_IMG] is received from a UNIT or GCS 
*/
function EVT_msgFromUnit_IMG(me, data) { //,p_andruavUnit, bin, description, latitude, logitude, gpsProvider, time, altitude, speed, bearing, accuracy) {

	if (data.img.length > 0) {
		var blob = new Blob([data.img], { type: 'image/jpeg' });


		var reader = new FileReader();
		reader.onload = function (event) {
			var contents = event.target.result;
			$('#unitImg').data('binaryImage', contents);

			// Cleanup the reader object
			reader.abort();
			reader = null;
			return;
		};

		reader.onerror = function (event) {
			console.p_error("File could not be read! Code " + event.target.p_error.code);
		};

		reader.readAsDataURL(blob);

		$('#unitImg').attr('src', 'data:image/jpeg;base64,' + js_helpers.fn_arrayBufferToBase64(data.img));
		$('#modal_fpv').show();
	}

	const latlng = js_leafletmap.fn_getLocationObjectBy_latlng(data.lat, data.lng);
	$('#unitImg').data('imgLocation', latlng);
	fn_showCameraIcon(latlng);
}

function fn_showCameraIcon(latlng) {
	const v_marker = js_leafletmap.fn_CreateMarker('/images/camera_24x24.png', 'image');
	js_leafletmap.fn_setPosition(v_marker, latlng);
}

function hlp_saveImage_html() {
	const contents = $('#unitImg').data('binaryImage');
	saveData(contents, 'image.jpg');

}


function hlp_gotoImage_Map() {
	const location = $('#unitImg').data('imgLocation');
	if (location !== null && location !== undefined) {
		// if (js_leafletmap.fn_getZoom() < 14) {
		// 	js_leafletmap.fn_setZoom(14);
		// }

		js_leafletmap.fn_PanTo_latlng(location.lat, location.lng);
	}
}


/**
  Called when a new unit joins the system.
*/
var EVT_andruavUnitAdded = function (me, p_andruavUnit) {
	// if (p_andruavUnit.m_IsGCS === false) {
	// 	p_andruavUnit.m_gui.defaultHieght = js_globals.CONST_DEFAULT_ALTITUDE;
	// 	p_andruavUnit.m_gui.defaultCircleRadius = js_globals.CONST_DEFAULT_RADIUS;
	// }

	js_speak.fn_speak(p_andruavUnit.m_unitName + " unit added");
	if (!js_globals.v_ui_active_party_id && p_andruavUnit?.getPartyID) {
		fn_setUIActiveUnit(p_andruavUnit.getPartyID());
	}

	js_eventEmitter.fn_dispatch(js_event.EE_unitAdded, p_andruavUnit);
	fn_opsHealthSyncFromUnits();
}


var EVT_HomePointChanged = function (me, p_andruavUnit) {
	let v_latlng = js_leafletmap.fn_getLocationObjectBy_latlng(p_andruavUnit.m_Geo_Tags.p_HomePoint.lat, p_andruavUnit.m_Geo_Tags.p_HomePoint.lng);

	if (p_andruavUnit.m_gui.m_marker_home === null || p_andruavUnit.m_gui.m_marker_home === undefined) {
		const v_html = "<p class='text-light margin_zero fs-6'>" + p_andruavUnit.m_unitName + "</p>";
		let v_home = js_leafletmap.fn_CreateMarker('/images/home_b_24x24.png', p_andruavUnit.m_unitName, [16, 48], false, false, v_html, [24, 24]);

		js_leafletmap.fn_setPosition(v_home, v_latlng)

		// if (p_andruavUnit.m_IsGCS === true) {
		// 	js_leafletmap.fn_createBootStrapIcon (v_home, 'bi bi-c-circle', '#ffff0000', [32, 32]);
		// }

		let v_circleMission = null;
		if (p_andruavUnit.m_Geo_Tags.p_HomePoint.radius_accuracy) {
			const latlng = js_leafletmap.fn_getLocationObjectBy_latlng(p_andruavUnit.m_Geo_Tags.p_HomePoint.lat, p_andruavUnit.m_Geo_Tags.p_HomePoint.lng);

			v_circleMission = js_leafletmap.fn_drawMissionCircle(latlng, p_andruavUnit.m_Geo_Tags.p_HomePoint.radius_accuracy);
		}


		p_andruavUnit.m_gui.m_marker_home =
		{
			'home_marker': v_home,
			'radius_marker': v_circleMission
		}

		js_leafletmap.fn_addListenerOnClickMarker(v_home,
			function (p_lat, p_lng) {
				setTimeout(function () {

					showAndruavHomePointInfo(p_lat, p_lng, p_andruavUnit);
				}, 300);
			});
	}

	js_leafletmap.fn_setPosition(p_andruavUnit.m_gui.m_marker_home.home_marker, v_latlng);



};


var EVT_DistinationPointChanged = function (me, p_andruavUnit) {

	const gui = p_andruavUnit.m_gui;

	// Keep UI simple in swarm/follow mode: do not render a second "destination drone" marker.
	if (p_andruavUnit.m_Geo_Tags.p_DestinationPoint.type === js_andruavMessages.CONST_DESTINATION_SWARM_MY_LOCATION) {

		if (gui.m_marker_destination !== null && gui.m_marker_destination !== undefined) {
			js_leafletmap.fn_hideItem(gui.m_marker_destination);
			gui.m_marker_destination = null;
			p_andruavUnit.m_Geo_Tags.p_DestinationPoint.m_needsIcon = true;
		}
		return;
	}
	let v_latlng = js_leafletmap.fn_getLocationObjectBy_latlng(p_andruavUnit.m_Geo_Tags.p_DestinationPoint.lat, p_andruavUnit.m_Geo_Tags.p_DestinationPoint.lng);

	if (gui.m_marker_destination === null || gui.m_marker_destination === undefined) {
		gui.m_marker_destination = js_leafletmap.fn_CreateMarker('/images/destination_bg_32x32.png', "Target of: " + p_andruavUnit.m_unitName, [16, 48], false, false, "", [32, 32]);
	}

	if (p_andruavUnit.m_Geo_Tags.p_DestinationPoint.m_needsIcon === true) {
		js_leafletmap.fn_setVehicleIcon(gui.m_marker_destination, getDestinationPointIcon(p_andruavUnit), "Target of: " + p_andruavUnit.m_unitName, [16, 48], false, false, p_andruavUnit.m_unitName, [32, 32]);
		p_andruavUnit.m_Geo_Tags.p_DestinationPoint.m_needsIcon = false;
	}


	js_leafletmap.fn_setPosition(gui.m_marker_destination, v_latlng)
};



/**
  Received when a notification sent by remote UNIT.
  It could be p_error, warning or notification.
  *******************
  errorNo 			: 
								// 0	MAV_SEVERITY_EMERGENCY	System is unusable. This is a "panic" condition.
						// 1	MAV_SEVERITY_ALERT	Action should be taken immediately. Indicates p_error in non-critical systems.
						// 2	MAV_SEVERITY_CRITICAL	Action must be taken immediately. Indicates failure in a primary system.
						// 3	MAV_SEVERITY_ERROR	Indicates an p_error in secondary/redundant systems.
						// 4	MAV_SEVERITY_WARNING	Indicates about a possible future p_error if this is not resolved within a given timeframe. Example would be a low battery warning.
						// 5	MAV_SEVERITY_NOTICE	An unusual event has occurred, though not an p_error condition. This should be investigated for the root cause.
						// 6	MAV_SEVERITY_INFO	Normal operational messages. Useful for logging. No action is required for these messages.
						// 7	MAV_SEVERITY_DEBUG	Useful non-operational messages that can assist in debugging. These should not occur during normal operation.

  infoType			:
						  ERROR_CAMERA 	= 1
						  ERROR_BLUETOOTH	= 2
						  ERROR_USBERROR	= 3
						  ERROR_KMLERROR	= 4
  v_notification_Type	:
						  NOTIFICATIONTYPE_ERROR = 1;
						  NOTIFICATIONTYPE_WARNING = 2;
						  NOTIFICATIONTYPE_NORMAL = 3;
						  NOTIFICATIONTYPE_GENERIC = 0;
  Description	'DS		: 
						  Messag
*/
var EVT_andruavUnitError = function (me, data) {
	const p_andruavUnit = data.unit;
	const p_error = data.err;
	const v_description = ((p_error?.Description) ? p_error.Description : '').trim().toLowerCase();

	// Suppress generic DE MAV_RESULT ACK noise that confuses operators.
	// Keep all other warnings/errors visible.
	if (
		v_description.startsWith('command is not supported (unknown).') ||
		v_description.startsWith('command is valid, but execution has failed.')
	) {
		return;
	}

	let v_notification_Type;
	let v_cssclass = 'good';
	switch (p_error.notification_Type) {
		case 0:
			v_notification_Type = 'emergency';
			v_cssclass = 'error';
			break;
		case 1:
			v_notification_Type = 'alert';
			v_cssclass = 'error';
			break;
		case 2:
			v_notification_Type = 'critical';
			v_cssclass = 'error';
			break;
		case 3:
			v_notification_Type = 'error';
			v_cssclass = 'error';
			break;
		case 4:
			v_notification_Type = 'warning';
			v_cssclass = 'warning';
			break;
		case 5:
			v_notification_Type = 'notice';
			v_cssclass = 'good';
			break;
		case 6:
			v_notification_Type = 'info';
			v_cssclass = 'good';
			break;
		case 7:
			v_notification_Type = 'debug';
			v_cssclass = 'good';
			break;
	}
	const c_msg = {};
	c_msg.m_unit = p_andruavUnit;
	c_msg.m_notification_Type = v_notification_Type;
	c_msg.m_cssclass = v_cssclass;
	c_msg.m_error = p_error;
	js_eventEmitter.fn_dispatch(js_event.EE_onMessage, c_msg);
	fn_uiAlertsAdd({
		level: (v_notification_Type === 'error' || v_notification_Type === 'critical' || v_notification_Type === 'alert' || v_notification_Type === 'emergency') ? 'error' : (v_notification_Type === 'warning' ? 'warn' : 'info'),
		source: 'unit',
		partyID: p_andruavUnit?.getPartyID ? p_andruavUnit.getPartyID() : '',
		message: `${p_andruavUnit.m_unitName}: ${p_error.Description}`
	});




	$('#message_notification').append("<div class='" + v_cssclass + "'>" + p_andruavUnit.m_unitName + ": " + p_error.Description + "</div>");

	if (p_error.infoType !== js_andruavMessages.CONST_INFOTYPE_GEOFENCE) {
		if (p_error.v_notification_Type <= 3) {
			//http://github.hubspot.com/messenger/docs/welcome/
			// TODO: Replace Messenger REACT2
			// Messenger().post({
			// 	type: v_notification_Type,
			// 	message: p_andruavUnit.m_unitName + ":" + p_error.Description
			// });

			// only speak out errors
			js_speak.fn_speak(p_andruavUnit.m_unitName + ' ' + p_error.Description);
		}
	}
};

let infowindow2 = null
let infowindowADSB = null;

function fn_showAdSBInfo(event, _adsb) {
}


// function fn_showAndruavUnitInfo(p_lat, p_lng, p_andruavUnit) {
// 	let sys_id = "";
// 	if (p_andruavUnit.m_FCBParameters.m_systemID !== 0) {
// 		sys_id = 'sysid:' + p_andruavUnit.m_FCBParameters.m_systemID + ' ';
// 	}
// 	let armedBadge = "";
// 	if (p_andruavUnit.m_isArmed) armedBadge = '<span class="text-danger">&nbsp;<strong>ARMED</strong>&nbsp;</span>';
// 	else armedBadge = '<span class="text-success">&nbsp;disarmed&nbsp;</span>';
// 	if (p_andruavUnit.m_isFlying) armedBadge += '<span class="text-danger">&nbsp;flying&nbsp;</span>';
// 	else armedBadge += '<span class="text-success">&nbsp;on-ground&nbsp;</span>';

// 	let markerContent = "<p class='img-rounded bg-primary text-white'><strong class='css_padding_5'>" + p_andruavUnit.m_unitName + "</strong> <span>" + sys_id + "</span></p>\
// 			  	<style class='img-rounded help-block'>" + p_andruavUnit.Description + "</style>";

// 	if (p_andruavUnit.m_IsGCS === false) {
// 		markerContent += "<span>" + armedBadge + " <span class='text-success'><strong>" + hlp_getFlightMode(p_andruavUnit) + "</strong></span> </span>";
// 	}
// 	else {
// 		markerContent += "<p> <span class='text-success'>Ground Control Station</span> </p>";
// 	}

// 	let vAlt = p_andruavUnit.m_Nav_Info.p_Location.alt_relative;
// 	let vAlt_abs = p_andruavUnit.m_Nav_Info.p_Location.alt_abs;
// 	if (vAlt === null || vAlt === undefined) {
// 		vAlt = '?';
// 	}
// 	else {
// 		vAlt = vAlt.toFixed(0);
// 	}
// 	if (vAlt_abs === null || vAlt_abs === undefined) {
// 		vAlt_abs = '';
// 	}
// 	else {
// 		vAlt_abs = ' <span class="text-primary">abs:</span>' + vAlt_abs.toFixed(0);
// 	}
// 	vAlt = vAlt + vAlt_abs;

// 	let vSpeed = p_andruavUnit.m_Nav_Info.p_Location.ground_speed;
// 	if (vSpeed === null || vSpeed === undefined) {
// 		vSpeed = '?';
// 	}
// 	else {
// 		vSpeed = vSpeed.toFixed(1);
// 	}
// 	let vAirSpeed = p_andruavUnit.m_Nav_Info.p_Location.air_speed;
// 	if (vAirSpeed === null || vAirSpeed === undefined) {
// 		vAirSpeed = '?';
// 	}
// 	else {
// 		vAirSpeed = vAirSpeed.toFixed(1);
// 	}
// 	js_leafletmap.fn_getElevationForLocation(p_lat, p_lng
// 		, function (p_elevation, p_lat, p_lng) {
// 			if (p_elevation !== null && p_elevation !== undefined) {

// 				if (js_localStorage.fn_getMetricSystem() === false) {
// 					p_elevation = js_helpers.CONST_METER_TO_FEET * p_elevation;
// 				}

// 				if (isNaN(p_elevation) === false) {
// 					p_elevation = p_elevation.toFixed(1);
// 				}
// 				markerContent += `<br><span class="text-primary">lat:<span class="text-success">${(p_lat).toFixed(6)}</span><span class="text-primary">,lng:</span><span class="text-success">${(p_lng).toFixed(6)}</span></br>
// 							<span class="text-primary">alt:</span><span class="text-success">${vAlt}</span><span class="text-primary"> m</span>
// 							<br><span class="text-primary">GS:</span><span class="text-success">${vSpeed} </span><span class="text-primary"> m/s</span>
// 							<span class="text-primary"> AS:</span><span class="text-success">${vAirSpeed} </span><span class="text-primary"> m/s</span>`;

// 				if (p_andruavUnit.m_Swarm.m_isLeader === true) {

// 					markerContent += '<br><span class="text-danger "><strong>Leader</strong></span>'
// 				}
// 				if (p_andruavUnit.m_Swarm.m_following !== null && p_andruavUnit.m_Swarm.m_following !== undefined) {
// 					let v_andruavUnitLeader = js_globals.m_andruavUnitList.fn_getUnit(p_andruavUnit.m_Swarm.m_following);
// 					if (v_andruavUnitLeader != null) {
// 						markerContent += '<br><span class="text-warning ">Following:</span><span class="text-success ">' + v_andruavUnitLeader.m_unitName + '</span>'
// 					}
// 				}

// 				if (js_globals.CONST_MAP_GOOLE === true) {
// 					markerContent += '<br> sea-lvl alt:' + p_elevation + ' m.</p>';
// 				}
// 			}

// 			infowindow2 = js_leafletmap.fn_showInfoWindow(infowindow2, markerContent, p_lat, p_lng);

// 		});

// }

function showAndruavHomePointInfo(p_lat, p_lng, p_andruavUnit) {
	let _style = "", _icon = "";


	let v_contentString = "<p class='img-rounded bg-primary text-white" + _style + "'><strong> Home of " + p_andruavUnit.m_unitName + _icon + "</strong></p> ";

	infowindow = js_leafletmap.fn_showInfoWindow(infowindow, v_contentString, p_lat, p_lng);
}


function showGeoFenceInfo(p_lat, p_lng, geoFenceInfo) {
	let _style, _icon;
	if (geoFenceInfo.m_shouldKeepOutside === true) {
		_style = "bg-danger";
		_icon = "&nbsp;<span class='glyphicon glyphicon-ban-circle text-danger css_float_right'></span>";
	}
	else {
		_style = "bg-success";
		_icon = "&nbsp;<span class='glyphicon glyphicon-ok-circle text-success css_float_right'></span>";
	}

	let v_contentString = "<p class='img-rounded " + _style + "'><strong>" + geoFenceInfo.m_geoFenceName + _icon + "</strong></p><span class='help-block'>" + p_lat.toFixed(7) + " " + p_lng.toFixed(7) + "</span>";
	infowindow = js_leafletmap.fn_showInfoWindow(infowindow, v_contentString, p_lat, p_lng);

}


function EVT_andruavUnitGeoFenceBeforeDelete(me, geoFenceInfo) {
	if (geoFenceInfo !== null && geoFenceInfo !== undefined) {
		if (geoFenceInfo.flightPath !== null) {
			js_leafletmap.fn_hideItem(geoFenceInfo.flightPath);
		}
	}
	else {
		// hide all

		let keys = Object.keys(js_globals.v_andruavClient.m_andruavGeoFences);
		let size = Object.keys(js_globals.v_andruavClient.m_andruavGeoFences).length;

		for (let i = 0; i < size; ++i) {
			geoFenceInfo = js_globals.v_andruavClient.m_andruavGeoFences[keys[i]];

			if (geoFenceInfo.flightPath !== null && geoFenceInfo.flightPath !== undefined) {
				js_leafletmap.fn_hideItem(geoFenceInfo.flightPath);
			}

		}
	}
}



function EVT_andruavUnitGeoFenceUpdated(me, data) {
	const geoFenceInfo = data.fence;
	const p_andruavUnit = data.unit;

	let geoFenceCoordinates = geoFenceInfo.LngLatPoints;

	if (js_leafletmap.m_isMapInit === false) { // in case map is not loaded
		setTimeout(function () {
			EVT_andruavUnitGeoFenceUpdated(me, data);
		}, 800);
		return; // Exit to avoid processing before map is initialized
	}

	let v_geoFence = null;
	let oldgeoFenceInfo = js_globals.v_andruavClient.m_andruavGeoFences[geoFenceInfo.m_geoFenceName];

	switch (geoFenceInfo.fencetype) {
		case js_andruavMessages.CONST_TYPE_LinearFence:
			v_geoFence = js_leafletmap.fn_drawPolyline(geoFenceCoordinates, geoFenceInfo.m_shouldKeepOutside);
			geoFenceInfo.flightPath = v_geoFence;

			if (!js_globals.v_andruavClient.m_andruavGeoFences.hasOwnProperty(geoFenceInfo.m_geoFenceName)) {
				oldgeoFenceInfo = geoFenceInfo;
				oldgeoFenceInfo.Units = {};
			} else {
				if (oldgeoFenceInfo.flightPath) {
					js_leafletmap.fn_hideItem(oldgeoFenceInfo.flightPath); // Corrected to hide old flight path
				}
				geoFenceInfo.Units = oldgeoFenceInfo.Units;
				oldgeoFenceInfo = geoFenceInfo;
			}
			break;

		case js_andruavMessages.CONST_TYPE_PolygonFence:
			v_geoFence = js_leafletmap.fn_drawPolygon(geoFenceCoordinates, geoFenceInfo.m_shouldKeepOutside);
			geoFenceInfo.flightPath = v_geoFence;

			if (!js_globals.v_andruavClient.m_andruavGeoFences.hasOwnProperty(geoFenceInfo.m_geoFenceName)) {
				oldgeoFenceInfo = geoFenceInfo;
				oldgeoFenceInfo.Units = {};
			} else {
				if (oldgeoFenceInfo.flightPath) {
					js_leafletmap.fn_hideItem(oldgeoFenceInfo.flightPath); // Corrected to hide old flight path
				}
				geoFenceInfo.Units = oldgeoFenceInfo.Units;
				oldgeoFenceInfo = geoFenceInfo;
			}
			break;

		case js_andruavMessages.CONST_TYPE_CylinderFence:
			v_geoFence = js_leafletmap.fn_drawCircle(geoFenceCoordinates[0], geoFenceInfo.m_maximumDistance, geoFenceInfo.m_shouldKeepOutside);
			geoFenceInfo.flightPath = v_geoFence;

			if (!js_globals.v_andruavClient.m_andruavGeoFences.hasOwnProperty(geoFenceInfo.m_geoFenceName)) {
				oldgeoFenceInfo = geoFenceInfo;
				oldgeoFenceInfo.Units = {};
			} else {
				if (oldgeoFenceInfo.flightPath) {
					js_leafletmap.fn_hideItem(oldgeoFenceInfo.flightPath); // Corrected to hide old flight path
				}
				geoFenceInfo.Units = oldgeoFenceInfo.Units;
				oldgeoFenceInfo = geoFenceInfo;
			}
			break;

		default:
			break;
	}

	// IMPORTANT: Update the global geofence storage with the current info
	js_globals.v_andruavClient.m_andruavGeoFences[geoFenceInfo.m_geoFenceName] = oldgeoFenceInfo;

	if (v_geoFence !== null) {
		var _dblClickTimer;
		js_leafletmap.fn_addListenerOnDblClickMarker(v_geoFence, function (p_lat, p_lng) {
			clearTimeout(_dblClickTimer);
			_dblClickTimer = null;
			fn_contextMenu(js_leafletmap.fn_getLocationObjectBy_latlng(p_lat, p_lng));
		});

		js_leafletmap.fn_addListenerOnClickMarker(v_geoFence, function (p_lat, p_lng) {
			if (_dblClickTimer !== null) return;
			_dblClickTimer = setTimeout(() => {
				showGeoFenceInfo(p_lat, p_lng, geoFenceInfo);
				_dblClickTimer = null;
			}, 200);
		});
	}

	if (p_andruavUnit) {
		oldgeoFenceInfo.Units[p_andruavUnit.getPartyID()] = {
			geoFenceHitInfo: {
				hasValue: false,
				fenceName: geoFenceInfo.m_geoFenceName,
				m_inZone: false,
				m_shouldKeepOutside: geoFenceInfo.m_shouldKeepOutside
			}
		};
	}
}


function EVT_andruavUnitGeoFenceHit(me, data) {
	const p_andruavUnit = data.unit;
	const geoFenceHitInfo = data.fenceHit;

	var fence = js_globals.v_andruavClient.m_andruavGeoFences[geoFenceHitInfo.fenceName];
	if ((fence === undefined) || (fence === null)) {
		js_globals.v_andruavFacade.API_requestGeoFences(p_andruavUnit, geoFenceHitInfo.fenceName);
		return;
	}
	if (fence.Units[p_andruavUnit.getPartyID()] === undefined) fence.Units[p_andruavUnit.getPartyID()] = {};
	fence.Units[p_andruavUnit.getPartyID()].geoFenceHitInfo = geoFenceHitInfo;
	if (p_andruavUnit.m_gui.m_marker === null || p_andruavUnit.m_gui.m_marker === undefined) return;   // will be updated later when GPS message is recieved from that drone.
	var typeMsg = "info"; var msg = "OK";
	if (geoFenceHitInfo.m_inZone && geoFenceHitInfo.m_shouldKeepOutside) { typeMsg = 'p_error'; msg = "should be Out fence " + geoFenceHitInfo.fenceName; }
	else if (!geoFenceHitInfo.m_inZone && !geoFenceHitInfo.m_shouldKeepOutside) { typeMsg = 'p_error'; msg = "should be In fence " + geoFenceHitInfo.fenceName; }
	// TODO: Replace Messenger REACT2
	// Messenger().post({
	// 	type: typeMsg,
	// 	message: p_andruavUnit.m_unitName + ":" + "GeoFenceHit: " + msg
	// });
	if (msg === "OK") {

	}
	else {
		js_speak.fn_speak("unit " + p_andruavUnit.m_unitName + " " + msg);
	}

	js_eventEmitter.fn_dispatch(js_event.EE_unitUpdated, p_andruavUnit);
}


function gui_hidesubmenus() {
	$('div#debugpanel').hide();
	$('#btnConnectURL').hide();
}


function fn_gui_init_unitList() {
	$('#andruav_unit_list_array_float').draggable();
	$('#andruav_unit_list_array_float').on("mouseover", function () {
		$('#andruav_unit_list_array_float').css('opacity', '1.0');
	});
	$('#andruav_unit_list_array_float').on("mouseout", function () {
		$('#andruav_unit_list_array_float').css('opacity', '0.8');
	});

}

function fn_gui_init_fpvVtrl() {
	$('#modal_fpv').hide();
	$('#modal_fpv').draggable();
	$('#modal_fpv').on('mouseover', function () {
		$('#modal_fpv').css('opacity', '1.0');
	});
	$('#modal_fpv').on('mouseout', function () {
		$('#modal_fpv').css('opacity', '0.4');
	});
	$('#modal_fpv').find('#btnclose').on('click', function () {
		$('#modal_fpv').hide();
	});
	//http://www.bootply.com/XyZeggFcK7

	$('#unitImg_save').click(hlp_saveImage_html);
	$('#modal_fpv').find('#btnGoto').click(hlp_gotoImage_Map);
}


async function fn_login(p_email, p_access_code, allowAuthRetry = true, keepTraceId = false) {
	fn_resetMapAutoCenterState();
	if (keepTraceId !== true || !js_globals.v_connectTraceId) {
		js_globals.v_connectTraceId = fn_newTraceID();
	}
	js_globals.v_connectState = true;
	fn_diag('auth', 'login_requested', { email: p_email, allowAuthRetry: allowAuthRetry === true });
	js_andruavAuth.fn_retryLogin(allowAuthRetry === true);
	await js_andruavAuth.fn_do_loginAccount(p_email, p_access_code);
	if (js_andruavAuth.fn_logined() !== true) {
		fn_diag('auth', 'login_not_ready', {});
		return false;
	}
	return true;
}

function fn_connectWebSocket(me) {
	// create a group object
	if (js_andruav_ws.AndruavClientWS.getSocketStatus() !== js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) {

		if (js_andruavAuth.fn_logined() === false) {
			js_common.fn_console_log("js_andruavAuth.fn_logined() === false");
			return;
		}

		js_globals.v_andruavClient = js_andruav_parser.AndruavClientParser;
		js_globals.v_andruavFacade = js_andruav_facade.AndruavClientFacade;
		js_globals.v_andruavWS = js_andruav_ws.AndruavClientWS;
		fn_commandFeedbackInit();

		js_globals.v_andruavWS.fn_init();
		const authPartyID = js_andruavAuth.fn_getPartyID();
		const uiPartyID = $('#txtUnitID').val();
		const isPluginMode = js_siteConfig.CONST_WEBCONNECTOR_ENABLED && js_localStorage.fn_getWebConnectorEnabled();

		// PartyID rules:
		// - Normal (cloud) mode: partyID is client-determined (UI/localStorage).
		// - Plugin mode: plugin generates a partyId and returns it as `plugin_party_id` in /w/wl/.
		//   In this mode we MUST use the plugin-provided partyId for connecting to plugin WSS.
		if (isPluginMode && authPartyID) {
			js_globals.v_andruavWS.partyID = authPartyID;
			js_globals.v_andruavWS.unitID = authPartyID;
		} else {
			js_globals.v_andruavWS.partyID = authPartyID || uiPartyID;
			js_globals.v_andruavWS.unitID = authPartyID || uiPartyID;
		}

		js_globals.v_andruavWS.m_groupName = $('#txtGroupName').val();
		console.info('[WS] connecting with partyID', {
			authPartyID: authPartyID,
			uiPartyID: uiPartyID,
			isPluginMode: isPluginMode,
			finalPartyID: js_globals.v_andruavWS.partyID,
		});
		fn_diag('ws', 'connect_ws_requested', {
			authPartyID: authPartyID,
			uiPartyID: uiPartyID,
			isPluginMode: isPluginMode,
			finalPartyID: js_globals.v_andruavWS.partyID
		});
		js_globals.v_andruavWS.m_server_ip = js_andruavAuth.m_server_ip;
		js_globals.v_andruavWS.m_server_port = js_andruavAuth.m_server_port;
		js_globals.v_andruavWS.m_server_port_ss = js_andruavAuth.m_server_port;
		js_globals.v_andruavWS.server_AuthKey = js_andruavAuth.server_AuthKey;
		js_globals.v_andruavWS.m_permissions = js_andruavAuth.fn_getPermission();
		js_eventEmitter.fn_subscribe(js_event.EE_WS_OPEN, this, EVT_onOpen);
		js_eventEmitter.fn_subscribe(js_event.EE_WS_CLOSE, this, EVT_onClose);
		js_eventEmitter.fn_subscribe(js_event.EE_onSocketStatus2, this, fn_onSocketStatus);
		js_eventEmitter.fn_subscribe(js_event.EE_onDeleted, this, EVT_onDeleted);
		js_eventEmitter.fn_subscribe(js_event.EE_msgFromUnit_GPS, this, EVT_msgFromUnit_GPS);
		js_eventEmitter.fn_subscribe(js_event.EE_msgFromUnit_IMG, this, EVT_msgFromUnit_IMG);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitAdded, this, EVT_andruavUnitAdded);
		js_eventEmitter.fn_subscribe(js_event.EE_HomePointChanged, this, EVT_HomePointChanged);
		js_eventEmitter.fn_subscribe(js_event.EE_DistinationPointChanged, this, EVT_DistinationPointChanged);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitError, this, EVT_andruavUnitError);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitGeoFenceUpdated, this, EVT_andruavUnitGeoFenceUpdated);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitGeoFenceHit, this, EVT_andruavUnitGeoFenceHit);
		js_eventEmitter.fn_subscribe(js_event.EE_msgFromUnit_WayPoints, this, EVT_msgFromUnit_WayPoints);
		js_eventEmitter.fn_subscribe(js_event.EE_msgFromUnit_WayPointsUpdated, this, EVT_msgFromUnit_WayPointsUpdated);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitArmedUpdated, this, EVT_andruavUnitArmedUpdated);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitGeoFenceBeforeDelete, this, EVT_andruavUnitGeoFenceBeforeDelete);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitFCBUpdated, this, EVT_andruavUnitFCBUpdated);



		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitFlyingUpdated, this, EVT_andruavUnitFlyingUpdated);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitFightModeUpdated, this, EVT_andruavUnitFightModeUpdated);
		js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitVehicleTypeUpdated, this, EVT_andruavUnitVehicleTypeUpdated);
		js_eventEmitter.fn_subscribe(js_event.EE_unitOnlineChanged, this, EVT_unitOnlineChanged);
		js_eventEmitter.fn_subscribe(js_event.EE_unitHighlighted, this, EVT_unitHighlightedUI);
		js_eventEmitter.fn_subscribe(js_event.EE_uiFocusChanged, this, EVT_uiFocusChanged);
		js_eventEmitter.fn_subscribe(js_event.EE_uiMissionLayerChanged, this, EVT_uiMissionLayerChanged);
		js_eventEmitter.fn_subscribe(js_event.EE_onProxyInfoUpdated, this, EVT_onProxyInfoUpdated);
		js_eventEmitter.fn_subscribe(js_event.EE_videoStreamStarted, this, EVT_onVideoStreamStartedOps);
		js_eventEmitter.fn_subscribe(js_event.EE_videoStreamStopped, this, EVT_onVideoStreamStoppedOps);

		js_eventEmitter.fn_subscribe(js_event.EE_unitSDRTrigger, this, EVT_andruavUnitSDRTrigger);


		fn_opsHealthHandleSocketStatus({
			status: js_andruavMessages.CONST_SOCKET_STATUS_CONNECTING,
			retrying: false,
			failed: false,
			reason: 'Opening WebSocket',
			attempt: v_wsReconnectAttempts,
			maxAttempts: WS_RECONNECT_MAX_ATTEMPTS
		});
		fn_opsHealthSyncFromUnits();
		js_websocket_bridge.fn_init();

		js_globals.v_andruavWS.fn_connect(js_andruavAuth.fn_getSessionID());
	}
}


export function fn_logout() {
	fn_resetMapAutoCenterState();
	js_globals.v_connectState = false;
	fn_stopUdpStatusWatchdog();
	v_wsReconnectAttempts = 0;
	v_wsReconnectCancelled = false;
	fn_clearWsReconnectTimer();
	Object.keys(v_udpRecoveryJobs).forEach(fn_clearTelemetryRecoveryJob);
	Object.keys(v_udpStatusWatchdogNotifiedAt).forEach((partyID) => delete v_udpStatusWatchdogNotifiedAt[partyID]);
	Object.keys(v_udpRecoveryCooldown).forEach((partyID) => delete v_udpRecoveryCooldown[partyID]);
	Object.keys(v_udpStatusProbeJobs).forEach((partyID) => delete v_udpStatusProbeJobs[partyID]);
	Object.keys(v_udpStatusAutoRecoveryAt).forEach((partyID) => delete v_udpStatusAutoRecoveryAt[partyID]);
	fn_clearGpsRenderJobs();
	js_andruavAuth.fn_retryLogin(false);
	fn_opsHealthAddEvent({
		source: 'auth',
		level: 'info',
		message: 'Logout requested'
	});
	fn_opsHealthReset();
	fn_uiStateReset();
	fn_uiAlertsReset();
	fn_missionIntegrityReset();
	fn_commandFeedbackReset();
	js_andruavAuth.fn_do_logoutAccount();
	js_andruav_ws.AndruavClientWS.API_delMe();
}

export function fn_connect(p_email, p_access_code) {
	js_globals.v_connectState = true;
	v_wsReconnectCancelled = false;
	if (js_andruav_ws.AndruavClientWS.isSocketConnectionDone() === true) {
		fn_logout();
	}
	else {
		fn_login(p_email, p_access_code, true, false);
	}
};


export function fn_deleteShapesinDB() {
	js_globals.v_andruavFacade.API_disableGeoFenceTasks(js_andruavAuth.m_username, js_globals.v_andruavWS.m_groupName, null, '_drone_', 1);

	js_globals.v_andruavFacade.API_requestDeleteGeoFences(null, null); // deattach drones from all fences in the group
	setTimeout(function () {
		// because it can take time to update database so an early relead in vehicle will be false.
		js_globals.v_andruavFacade.API_requestReloadLocalGroupGeoFenceTasks(null);
	}, 3000);
}



export function fn_submitShapes() {
	const len = js_globals.v_map_shapes.length;

	for (let i = 0; i < len; ++i) {
		if (
			((js_globals.v_map_shapes[i].m_geofenceInfo.m_valid !== true)
				&& (js_globals.v_map_shapes[i].m_geofenceInfo.m_deleted !== true))
		) {
			fn_do_modal_confirmation('Missing Information', 'Please enter missing fence data.');
			js_globals.v_map_shapes[i].setStyle({
				color: '#FE8030'
			});
			return;  // shape is not configured
		}
	}

	js_globals.v_andruavFacade.API_requestDeleteGeoFences(null, null); // deattach drones from all fences in the group
	js_globals.v_andruavFacade.API_disableGeoFenceTasks(js_andruavAuth.m_username, js_globals.v_andruavWS.m_groupName, null, '_drone_', 1);

	// new instance
	const fence_plan = new ClssAndruavFencePlan(1);

	const res = fence_plan.fn_generateAndruavFenceData(js_globals.v_map_shapes);
	const len_res = res.length;
	for (let i = 0; i < len_res; ++i) {
		if ((js_globals.v_andruavClient !== null) && (js_globals.v_andruavWS.fn_isRegistered() === true)) {
			js_globals.v_andruavFacade.API_saveGeoFenceTasks(js_andruavAuth.m_username, js_globals.v_andruavWS.m_groupName, null, '_drone_', 1, res[i]);
		}
	}


	setTimeout(function () {
		js_globals.v_andruavFacade.API_requestReloadLocalGroupGeoFenceTasks(null);
	}, 3000);
}




let fn_on_ready_called = false;
export function fn_on_ready() {

	if (fn_on_ready_called === true) return;
	fn_on_ready_called = true;

	$(function () {
		$(document).prop('title', js_siteConfig.CONST_TITLE);
	});

	if ((typeof (js_globals.CONST_MAP_GOOLE) == "undefined") || (js_globals.CONST_MAP_GOOLE === true)) {
		let v_script = window.document.createElement('script');
		v_script.type = 'text/javascript';

		v_script.src = "2a4034903490310033a90d2408a108a12e6924c1310033a9084429713021302129712d9027d924c131002b1133a90844264930212e6908a12e6924c1310033a908a124c131002b1108a12be433a90f812cb927d939310e89108114d13a2424c11ae93931118929710c40110414401a441ef11e4010811189302126491e402be40961384033a937510b642be4234127100af9264927d9297107e91ae91ef1129932c40bd1375105a4264924c12d902d90258424c126492cb90e892b112f442b113490172924c13100"._fn_hexDecode();
		window.document.body.append(v_script);
	}
	else
		if ((typeof (js_globals.CONST_MAP_GOOLE) !== "undefined") && (js_globals.CONST_MAP_GOOLE === false)) {
			initMap();
		}

	if (js_globals.v_EnableADSB === true) {
		js_eventEmitter.fn_subscribe(js_event.EE_adsbExchangeReady, this, fn_adsbObjectUpdate);
		js_eventEmitter.fn_subscribe(js_event.EE_adsbExpiredUpdate, this, fn_adsbExpiredUpdate);
	}



	enableDragging();


	fn_showMap();
	fn_opsHealthSyncFromUnits();
	fn_applyUIFocusRendering();
	fn_applyMissionLayerStylesAll();

	if (js_globals.CONST_MAP_EDITOR !== true) {
		gui_hidesubmenus();
		gui_initGlobalSection();


		$('#btn_showMap').click(
			fn_showMap
		);

		$('#btn_showVideo').click(
			fn_showVideoMainTab
		);


		$('#gimbaldiv').find('#btnpitchm').on('click', function () {
			const p = $('#div_video_view').attr('partyID');
			const p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p);
			fn_doGimbalCtrlStep(p_andruavUnit, -2, 0, 0);

		});

		$('#gimbaldiv').find('#btnrollp').on('click', function () {
			const p = $('#div_video_view').attr('partyID');
			const p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p);
			fn_doGimbalCtrlStep(p_andruavUnit, 0, +2, 0);

		});

		$('#gimbaldiv').find('#btnrollm').on('click', function () {
			const p = $('#div_video_view').attr('partyID');
			const p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p);
			fn_doGimbalCtrlStep(p_andruavUnit, 0, -2, 0);

		});

		$('#gimbaldiv').find('#btnyawp').on('click', function () {
			const p = $('#div_video_view').attr('partyID');
			const p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p);
			fn_doGimbalCtrlStep(p_andruavUnit, 0, 0, +2);

		});

		$('#gimbaldiv').find('#btnyawm').on('click', function () {
			const p = $('#div_video_view').attr('partyID');
			const p_andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(p);
			fn_doGimbalCtrlStep(p_andruavUnit, 0, 0, -2);
		});

		fn_gui_init_fpvVtrl();
		fn_gui_init_unitList();
	}
	else {

	}

	if ((QueryString.test !== undefined) && (QueryString.test !== null)) {
		$('.subblock#command').show();
		$('div#debugpanel').show();
	}


	// LOGIN		
	if ((QueryString.email === null || QueryString.email === undefined) || (QueryString.accesscode === null || QueryString.accesscode === undefined)) {
		// window.location.href = "http://example.com";
		//$('#txtUnitID').val('GCSMAP_' + js_common.fn_generateRandomString(3));

	}
	else {
		//http://127.0.0.1:9980/globalarclight.html?accesscode=myown&email=myown@myown.com&m_groupName=1&m_unitName=GCSWeb1

	}

	$("#alert .close").on('click', function (e) {
		$("#alert").hide();
	});

	$("#alert").hide();

	fn_handleKeyBoard();

	js_eventEmitter.fn_subscribe(js_event.EE_Auth_Logined, this, fn_connectWebSocket);

};  // end of onReady
