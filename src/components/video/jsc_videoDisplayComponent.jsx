import React from 'react';

import { js_globals } from '../../js/js_globals.js';
import { js_eventEmitter } from '../../js/js_eventEmitter.js'
import {EVENTS as js_event} from '../../js/js_eventList.js'
import * as js_helpers from '../../js/js_helpers.js'
import * as js_andruavUnit from '../../js/js_andruavUnit.js'

import { fn_showVideoMainTab } from '../../js/js_main.js'
import ClssCVideoScreen from './jsc_videoScreenComponent.jsx'


export class ClssCVideoControl extends React.Component {
    constructor() {
        super();
        this.state = {
            m_videoScreens: {},
            lastadded: null,
            needsTabActivation: false,
            'm_update': 0
        };


        this.key = Math.random().toString();
        
        this.m_flag_mounted = false;

        js_eventEmitter.fn_subscribe(js_event.EE_videoStreamStarted, this, this.fn_videoStarted);
        js_eventEmitter.fn_subscribe(js_event.EE_videoStreamStopped, this, this.fn_videoStopped);
        js_eventEmitter.fn_subscribe(js_event.EE_videoTabClose, this, this.fn_closeVideoTab);
    }

    
    componentDidMount() {
        this.m_flag_mounted = true;
    }
    
    componentDidUpdate() {
        // Activate the new tab after render if needed
        if (this.state.needsTabActivation && this.state.lastadded) {
            const v_obj = this.state.m_videoScreens[this.state.lastadded];
            if (v_obj) {
                const andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(v_obj.v_unit);
                const tabPaneId = 'cam_' + andruavUnit.getPartyID() + v_obj.v_track;
                const tabSelector = 'a[href="#' + tabPaneId + '"]';
                
                // Manually activate the tab by manipulating classes
                // Deactivate all tabs and panes
                const allTabs = document.querySelectorAll('#div_video_control .nav-link');
                const allPanes = document.querySelectorAll('#div_video_control .tab-pane');
                
                allTabs.forEach(tab => {
                    tab.classList.remove('active', 'show');
                    tab.setAttribute('aria-selected', 'false');
                });
                
                allPanes.forEach(pane => {
                    pane.classList.remove('active', 'show', 'in');
                    pane.classList.add('fade');
                });
                
                // Activate the new tab
                const tabElement = document.querySelector(tabSelector);
                const paneElement = document.getElementById(tabPaneId);
                
                if (tabElement && paneElement) {
                    tabElement.classList.add('active', 'show');
                    tabElement.setAttribute('aria-selected', 'true');
                    paneElement.classList.add('active', 'show', 'in');
                }
            }
            // Reset the flag
            this.setState({ needsTabActivation: false });
        }
    }
    
    
    fn_videoStarted(p_me, p_obj) {
        p_obj.andruavUnit.m_Video.m_videoactiveTracks[p_obj.talk.targetVideoTrack].VideoStreaming = js_andruavUnit.CONST_VIDEOSTREAMING_ON;

        let vid = p_obj.andruavUnit.getPartyID() + p_obj.talk.targetVideoTrack;
        if (p_me.state.m_videoScreens.hasOwnProperty(vid) === false) {
            p_me.state.m_videoScreens[vid] = {};
            const c_screen = p_me.state.m_videoScreens[vid];
            c_screen.v_unit = p_obj.andruavUnit.getPartyID();
            c_screen.v_track = p_obj.talk.targetVideoTrack;
            c_screen.v_index = js_helpers.fn_findWithAttributeIndex(p_obj.andruavUnit.m_Video.m_videoTracks, "id", p_obj.talk.targetVideoTrack);
            p_me.state.lastadded = vid;
            p_me.state.needsTabActivation = true; // Flag to activate tab after render
        }

        fn_showVideoMainTab();

        if (p_me.m_flag_mounted === false)return ;
        p_me.setState({'m_update': p_me.state.m_update +1});

    }


    fn_closeVideoTab(p_me, p_obj) {
        const vid = p_obj.unitPartyID + p_obj.trackID;
        if (p_me.state.m_videoScreens.hasOwnProperty(vid)) {
            delete p_me.state.m_videoScreens[vid];
        }

        if (p_me.state.lastadded === vid) {
            p_me.state.lastadded = null;
            p_me.state.needsTabActivation = false;
        }
        
        if (p_me.m_flag_mounted === false) return;
        p_me.setState({'m_update': p_me.state.m_update + 1});
    }


    fn_videoStopped(p_me, obj) {

        obj.andruavUnit.m_Video.m_videoactiveTracks[obj.talk.targetVideoTrack].VideoStreaming = js_andruavUnit.CONST_VIDEOSTREAMING_OFF;
        const vid = obj.andruavUnit.getPartyID() + obj.talk.targetVideoTrack;
        if (p_me.state.m_videoScreens.hasOwnProperty(vid)) {
            delete p_me.state.m_videoScreens[vid];
        }

        if (p_me.state.lastadded === vid) {
            p_me.state.lastadded = null;
            p_me.state.needsTabActivation = false;
        }

        if (p_me.m_flag_mounted === false)return ;
        p_me.setState({'m_update': p_me.state.m_update +1});
    }


    componentWillUnmount() {
        js_eventEmitter.fn_unsubscribe(js_event.EE_videoStreamStarted, this);
        js_eventEmitter.fn_unsubscribe(js_event.EE_videoStreamStopped, this);
        js_eventEmitter.fn_unsubscribe(js_event.EE_videoTabClose, this);
    }


    render() {
        const arr = Object.keys(this.state.m_videoScreens).filter((k) => {
            const v_obj = this.state.m_videoScreens[k];
            return (v_obj !== null && v_obj !== undefined);
        });

        let len = arr.length;

        if (len === 0) {
            return (
                <div className="container-fluid localcontainer">
                    <ul className="nav nav-tabs">
                        <li className="nav-item">
                            <a className="nav-link user-select-none txt-theme-aware active show" data-bs-toggle="tab" href="#cam_placeholder">
                                Camera
                            </a>
                        </li>
                    </ul>
                    <div id={this.key + "videoTabContent"} className="tab-content">
                        <div id="cam_placeholder" className="css_videoScreen tab-pane fade active show" style={{ position: 'relative' }}>
                            <h4 className="bg-primary txt-theme-aware">Camera Output</h4>
                            <div id="css_video_ctrl_panel" className="d-flex flex-row css_padding_zero" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_video_close" alt="Close Camera" title="Close Camera" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_goto_drone" alt="Goto Agent" title="Goto Agent" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_video_pip" alt="Picture in Picture" title="Picture in Picture" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_video_fullscreen" alt="Video Full Screen" title="Video Full Screen" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_camera_switch" alt="Switch Camera" title="Switch Camera" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_recvideo_ready" alt="Record Web" title="Record Web" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_camera_ready" alt="Take Snapshot" title="Take Snapshot" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <i className="bi-zoom-in css_large_icon text-success"></i>
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <i className="bi-zoom-out css_large_icon text-success"></i>
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_camera_mirrorX" alt="Mirror" title="Mirror" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_camera_rotate" alt="Rotate" title="Rotate" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <img className="cursor_default css_camera_flash_off" alt="Flash" title="Flash" />
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <i className="bi bi-arrows-expand css_large_icon text-primary" title="Fit (Contain)"></i>
                                </div>
                                <div className="d-flex justify-content-center align-items-center p-0 m-0 ms-1">
                                    <i className="bi bi-circle-half css_large_icon txt-theme-aware" title="Opacity"></i>
                                </div>
                            </div>
                            <div id="css_tvideo-div-placeholder" className="css_videoContainer" style={{ minHeight: '420px' }}></div>
                            <div
                                className="txt-theme-aware text-center"
                                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
                            >
                                <strong>No camera connected</strong>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        let out_h = [];
        let out_b = [];
        for (let i = 0; i < len; ++i) {

            let _first = "";
            const v_key = arr[i];
            const v_obj = this.state.m_videoScreens[v_key];
            if (v_obj !== null && v_obj !== undefined) {
                const andruavUnit = js_globals.m_andruavUnitList.fn_getUnit(v_obj.v_unit);

                if (this.state.lastadded === v_key) {
                    _first = "active show";
                }
                else {
                    _first = "";
                }

                out_h.push(<li key={'h' + v_key} className="nav-item">
                    <a className={"nav-link user-select-none  txt-theme-aware  " + _first} data-bs-toggle="tab" href={'#cam_' + andruavUnit.getPartyID() + v_obj.v_track}>{andruavUnit.m_unitName + ' #' + v_obj.v_index}</a>
                </li>);
                out_b.push(<ClssCVideoScreen key={v_key} first={_first} obj={v_obj} />);
            }
        }


        return (
            <div className="container-fluid localcontainer">
                <ul className="nav  nav-tabs">
                    {out_h}
                </ul>
                <div id={this.key + "videoTabContent"} className="tab-content">
                    {out_b}
                </div>
            </div>
        )
    }

}

