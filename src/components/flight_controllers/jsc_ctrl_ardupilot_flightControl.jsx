import React    from 'react';
import { createPortal } from 'react-dom';
import {js_globals} from '../../js/js_globals';
import {EVENTS as js_event} from '../../js/js_eventList.js'
import {js_eventEmitter} from '../../js/js_eventEmitter'
import * as js_andruavMessages from '../../js/protocol/js_andruavMessages'
import * as js_andruavUnit from '../../js/js_andruavUnit'
import * as js_helpers from '../../js/js_helpers'
import {js_speak} from '../../js/js_speak'
import { js_andruavAuth } from '../../js/js_andruav_auth.js';
import ClssSafetyHoldButton from '../common/jsc_safety_hold_button.jsx';
import {fn_auditAction, fn_do_modal_confirmation, fn_changeSpeed, fn_doYAW, fn_convertToMeter, gui_doYAW} from '../../js/js_main'

export class ClssCtrlArdupilotFlightController extends React.Component {
    constructor(props)
	{
		super (props);
		    const p_andruavUnit = this.props.v_andruavUnit;
		    const hasSameTypeUnits = js_globals.m_andruavUnitList &&
		        typeof js_globals.m_andruavUnitList.fn_hasSameTypeUnits === 'function' &&
		        js_globals.m_andruavUnitList.fn_hasSameTypeUnits(p_andruavUnit);
		    this.state = {
		        m_VehicleType: p_andruavUnit.m_VehicleType,
		        m_is_ready_to_arm: p_andruavUnit.m_is_ready_to_arm,
		        m_isArmed: p_andruavUnit.m_isArmed,
		        m_applyOnAllSameType: false,
		        m_hasSameTypeUnits: hasSameTypeUnits,
                m_isClimbEditorOpen: false,
                m_climbAltitudeInput: '',
                m_climbAltitudeMin: 0,
                m_climbAltitudeMax: 300,
                m_climbAltitudeUnit: 'm',
                m_climbEditorTop: 96,
                m_climbEditorLeft: 96,
                m_climbEditorMaxHeight: 420
			};
    }

    hlp_adjustFlightModeButtonClass (p_className, p_isActive)
    {
        if (p_className === null || p_className === undefined) return p_className;
        if (typeof p_className !== 'string') return p_className;

        if (p_className.includes('disabled') || p_className.includes('hidden')) return p_className;

        const colors = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];
        let res = p_className;

        for (let i = 0; i < colors.length; ++i)
        {
            const color = colors[i];
            const solid = `btn-${color}`;
            const outline = `btn-outline-${color}`;

            if (p_isActive === true)
            {
                if (res.includes(outline))
                {
                    res = res.replace(outline, solid);
                }
            }
            else
            {
                if (res.includes(solid) && !res.includes(outline))
                {
                    res = res.replace(solid, outline);
                }
            }
        }

        return res;
    }

    shouldComponentUpdate(nextProps, nextState) {
        // Only re-render if the gpio_obj has changed
        const p_andruavUnit = this.state;
        const { v_andruavUnit } = nextProps;

        const update =  (p_andruavUnit.m_VehicleType !== v_andruavUnit.m_VehicleType
            || p_andruavUnit.m_is_ready_to_arm !== v_andruavUnit.m_is_ready_to_arm
            || p_andruavUnit.m_isArmed !== v_andruavUnit.m_isArmed
            || (p_andruavUnit.m_flightMode !== v_andruavUnit.m_flightMode)
            || p_andruavUnit.m_applyOnAllSameType !== nextState.m_applyOnAllSameType
            || p_andruavUnit.m_hasSameTypeUnits !== nextState.m_hasSameTypeUnits
            || p_andruavUnit.m_isClimbEditorOpen !== nextState.m_isClimbEditorOpen
            || p_andruavUnit.m_climbAltitudeInput !== nextState.m_climbAltitudeInput
            || p_andruavUnit.m_climbAltitudeMin !== nextState.m_climbAltitudeMin
            || p_andruavUnit.m_climbAltitudeMax !== nextState.m_climbAltitudeMax
            || p_andruavUnit.m_climbAltitudeUnit !== nextState.m_climbAltitudeUnit
            || p_andruavUnit.m_climbEditorTop !== nextState.m_climbEditorTop
            || p_andruavUnit.m_climbEditorLeft !== nextState.m_climbEditorLeft
            || p_andruavUnit.m_climbEditorMaxHeight !== nextState.m_climbEditorMaxHeight
        );

        return update;
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const { v_andruavUnit } = nextProps;
        const hasSameTypeUnits = js_globals.m_andruavUnitList &&
            typeof js_globals.m_andruavUnitList.fn_hasSameTypeUnits === 'function' &&
            js_globals.m_andruavUnitList.fn_hasSameTypeUnits(v_andruavUnit);

        if (v_andruavUnit.m_VehicleType !== prevState.m_VehicleType ||
            v_andruavUnit.m_is_ready_to_arm !== prevState.m_is_ready_to_arm ||
            v_andruavUnit.m_isArmed !== prevState.m_isArmed ||
            hasSameTypeUnits !== prevState.m_hasSameTypeUnits) {
            return {
                m_VehicleType: v_andruavUnit.m_VehicleType,
                m_is_ready_to_arm: v_andruavUnit.m_is_ready_to_arm,
                m_isArmed: v_andruavUnit.m_isArmed,
                m_applyOnAllSameType: prevState.m_applyOnAllSameType,
                m_hasSameTypeUnits: hasSameTypeUnits
            };
        }
        return null; // No state update needed
    }

    hlp_getflightButtonStyles (p_andruavUnit)
	{
	    let res = {};
		res.btn_arm_class               = "";
        res.btn_climb_class             = "";
        res.btn_takeoff_class           = " disabled hidden ";
		res.btn_climb_text              = "Climb";
		res.btn_land_class              = "";
        res.btn_surface_class           = " disabled hidden ";
        res.btn_auto_class              = "";
        res.btn_guided_class            = "";
        res.btn_circle_class 	        = "";
        res.btn_brake_class             = " btn-outline-theme-aware ";
        res.btn_hold_class              = " btn-outline-theme-aware ";
        res.btn_brake_text              = "";
		res.btn_manual_class            = "";
        res.btn_acro_class              = " disabled hidden ";
        res.btn_stabilize_class         = " disabled hidden ";
        res.btn_alt_hold_class          = "";
        res.btn_pos_hold_class          = "";
        res.btn_loiter_class            = "";
        res.btn_rtl_class               = "";
        res.btn_srtl_class              = "";
        res.btn_circle_class            = "";
		res.btn_yaw_class               = "";
		res.btn_speed_class             = "";
        res.btn_cruise_class            = "";
        res.btn_fbwa_class              = "";
        res.btn_tele_class              = "";
        res.btn_load_wp_class           = "";
        res.btn_q_stabilize             = " disabled hidden";
        res.btn_q_loiter                = " disabled hidden";
        res.btn_q_hover                 = " disabled hidden";
        res.btn_q_land                  = " disabled hidden";
        res.btn_q_rtl                   = " disabled hidden";
        
        res.btn_servo_class         = " btn-success ";

        if (js_globals.CONST_EXPERIMENTAL_FEATURES_ENABLED === false )
        {
            res.btn_servo_class = " disabled hidden ";
        }
        
            
        const  c_manualTXBlockedSubAction = p_andruavUnit.m_Telemetry.fn_getManualTXBlockedSubAction();
            

		if (p_andruavUnit.m_isArmed === true) 
		{
            switch (p_andruavUnit.m_VehicleType)
            {
                case js_andruavUnit.VEHICLE_BOAT:
				case js_andruavUnit.VEHICLE_ROVER:
                    res.btn_arm_class 		    = " btn-danger";
                    res.btn_climb_class 	    = " disabled hidden ";
                    res.btn_land_class 		    = " disabled hidden ";
                    res.btn_surface_class       = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-primary  ";
                    res.btn_takeoff_class       = " disabled hidden ";
                    res.btn_guided_class 	    = " btn-primary  ";
                    res.btn_circle_class 	    = " btn-primary ";
                    res.btn_manual_class	    = " btn-primary  ";
                    res.btn_acro_class	        = " btn-primary  ";
                    res.btn_alt_hold_class      = " disabled hidden  ";
                    res.btn_pos_hold_class      = " disabled hidden  ";
                    res.btn_loiter_class	    = " btn-warning "; // used in boat only
                    res.btn_rtl_class 		    = " btn-primary ";
                    res.btn_srtl_class 		    = " btn-primary  ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " btn-primary disabled hidden ";
                    res.btn_fbwa_class 	 	    = " btn-primary disabled hidden ";
                    res.btn_yaw_class 	 	    = " disabled hidden ";
                    res.btn_brake_class 	    = " btn-primary disabled hidden ";
                    res.btn_hold_class          = " btn-primary  ";
                    res.btn_speed_class	 	    = " btn-success  ";
                break;
                    
                case js_andruavUnit.VEHICLE_TRI:
                case js_andruavUnit.VEHICLE_QUAD:
                    res.btn_takeoff_class       = " disabled hidden ";
                    res.btn_arm_class 		    = " btn-danger";
                    res.btn_climb_class 	    = " btn-warning  ";
                    res.btn_land_class 		    = " btn-warning  ";
                    res.btn_surface_class       = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-primary  ";
                    res.btn_guided_class 	    = " btn-primary  ";
                    res.btn_circle_class 	    = " btn-primary ";
                    res.btn_brake_class 	    = " btn-primary  ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_manual_class	    = " disabled hidden ";
                    res.btn_manual_onclick      = " ";
                    res.btn_alt_hold_class      = " btn-danger  ";
                    res.btn_pos_hold_class      = " btn-danger  ";
                    res.btn_loiter_class 	    = " btn-danger  ";
                    res.btn_rtl_class 		    = " btn-primary ";
                    res.btn_srtl_class 		    = " btn-primary  ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " disabled hidden ";
                    res.btn_fbwa_class 	 	    = " disabled hidden ";
                    res.btn_yaw_class 	 	    = " btn-success  ";
                    res.btn_speed_class 	    = " btn-success  ";
                    res.btn_acro_class          = " btn-danger ";
                    res.btn_stabilize_class     = " btn-danger ";
                    res.btn_alt_hold_class      = " btn-warning ";
                break;

                case js_andruavUnit.VEHICLE_SUBMARINE:
                    res.btn_takeoff_class      = " btn-outline-theme-aware ";
                    res.btn_arm_class 		    = " btn-danger ";
                    res.btn_climb_class 	    = " btn-warning ";
                    res.btn_climb_text          = "dive";
		            res.btn_land_class 		    = " disabled hidden ";
                    res.btn_surface_class       = " btn-warning ";
                    res.btn_auto_class 		    = " btn-primary ";
                    res.btn_guided_class 	    = " btn-primary ";
                    res.btn_circle_class 	    = " btn-primary ";
                    res.btn_brake_class 	    = " disabled hidden ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_manual_class	    = " disabled hidden ";
                    res.btn_manual_onclick      = " ";
                    res.btn_cruise_class  	    = " disabled hidden ";
                    res.btn_fbwa_class 	 	    = " disabled hidden ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden ";
                    res.btn_loiter_class 	    = " disabled hidden ";
                    res.btn_rtl_class 		    = " disabled hidden ";
                    res.btn_srtl_class 		    = " disabled hidden ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_yaw_class 	 	    = " btn-success  ";
                    res.btn_speed_class 	    = " btn-success  ";
                break;
                
                case js_andruavUnit.VEHICLE_VTOL:
                    // https://ardupilot.org/plane/docs/flight-modes.html
                    res.btn_arm_class 		    = " btn-danger ";
                    res.btn_climb_class 	    = " btn-warning ";
                    res.btn_takeoff_class       = " btn-warning ";
                    res.btn_land_class 		    = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-primary  ";
                    res.btn_guided_class 	    = " btn-primary  ";
                    res.btn_circle_class 	    = " btn-primary ";
                    res.btn_manual_class	    = " btn-danger   ";
                    res.btn_stabilize_class     = " btn-danger   ";
                    res.btn_brake_class 	    = " disabled hidden ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden ";
                    res.btn_loiter_class 	    = " btn-danger  ";
                    res.btn_rtl_class 		    = " btn-primary ";
                    res.btn_srtl_class 		    = " btn-primary ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " btn-primary  ";
                    res.btn_fbwa_class 	 	    = " btn-primary  ";
                    res.btn_yaw_class 	 	    = " disabled hidden   ";
                    res.btn_speed_class 	    = " btn-success  ";

                    res.btn_q_stabilize         = " btn-primary ";
                    res.btn_q_loiter            = " btn-danger ";
                    res.btn_q_hover             = " btn-primary ";
                    res.btn_q_land              = " btn-warning ";
                    res.btn_q_rtl               = " btn-primary ";
                break; 

                case js_andruavUnit.VEHICLE_PLANE:
                    // https://ardupilot.org/plane/docs/flight-modes.html
                    res.btn_arm_class 		    = " btn-danger ";
                    res.btn_climb_class 	    = " btn-warning ";
                    res.btn_takeoff_class       = " btn-warning ";
                    res.btn_land_class 		    = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-primary  ";
                    res.btn_guided_class 	    = " btn-primary  ";
                    res.btn_circle_class 	    = " btn-primary ";
                    res.btn_manual_class	    = " btn-danger   ";
                    res.btn_stabilize_class     = " btn-danger   ";
                    res.btn_brake_class 	    = " disabled hidden ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden ";
                    res.btn_loiter_class 	    = " btn-danger  ";
                    res.btn_rtl_class 		    = " btn-primary ";
                    res.btn_srtl_class 		    = " btn-primary ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " btn-primary  ";
                    res.btn_fbwa_class 	 	    = " btn-primary  ";
                    res.btn_yaw_class 	 	    = " disabled hidden   ";
                    res.btn_speed_class 	    = " btn-success  ";

                    res.btn_q_stabilize         = " disabled hidden ";
                    res.btn_q_loiter            = " disabled hidden ";
                    res.btn_q_hover             = " disabled hidden ";
                    res.btn_q_land              = " disabled hidden ";
                    res.btn_q_rtl               = " disabled hidden ";
                break; 

                default:
                    // https://ardupilot.org/plane/docs/flight-modes.html
                    res.btn_arm_class 		    = " btn-danger ";
                    res.btn_climb_class 	    = " btn-warning  ";
                    res.btn_land_class 		    = " btn-warning  ";
                    res.btn_auto_class 		    = " btn-primary  ";
                    res.btn_guided_class 	    = " btn-primary  ";
                    res.btn_circle_class 	    = " btn-primary ";
                    res.btn_manual_class	    = " btn-outline-theme-aware  ";
                    res.btn_acro_class	        = " disabled hidden ";
                    res.btn_brake_class 	    = " disabled hidden ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden  ";
                    res.btn_loiter_class 	    = " btn-primary  ";
                    res.btn_rtl_class 		    = " btn-primary ";
                    res.btn_srtl_class 		    = " btn-primary  ";
                    res.btn_cruise_class  	    = " btn-primary  ";
                    res.btn_fbwa_class 	 	    = " btn-primary  ";
                    res.btn_yaw_class 	 	    = " btn-success  ";
                    res.btn_speed_class 	    = " btn-success  ";
                break;
            }				
							
		}
		else
		{
            // NOT ARMED

			res.btn_arm_class 			= " btn-outline-theme-aware ";
			res.btn_climb_class 		= " disabled hidden ";
			res.btn_land_class 			= " disabled hidden ";
            res.btn_auto_class 			= " disabled hidden ";
			res.btn_guided_class 		= " btn-outline-theme-aware  ";
            res.btn_circle_class 	    = " btn-outline-theme-aware ";
            res.btn_manual_class	    = " disabled hidden ";
            res.btn_acro_class	        = " disabled hidden ";
            res.btn_stabilize_class     = " disabled hidden ";
            res.btn_pos_hold_class      = " disabled disabled hidden  ";
            res.btn_loiter_class 		= " disabled hidden ";
			res.btn_rtl_class 			= " btn-outline-theme-aware ";
			res.btn_srtl_class 		    = " btn-outline-theme-aware ";
            res.btn_cruise_class  	    = " disabled hidden ";
            res.btn_fbwa_class 	 	    = " bdisabled hidden ";
		    res.btn_yaw_class 	 		= " disabled hidden ";
		    res.btn_speed_class 	    = " disabled hidden ";
            
            switch (p_andruavUnit.m_VehicleType)
            {
                case js_andruavUnit.VEHICLE_SUBMARINE:
                    res.btn_takeoff_class      = " btn-outline-theme-aware ";
                    res.btn_arm_class 		    = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_climb_class 	    = " btn-outline-theme-aware ";
                    res.btn_climb_text          = "dive";
		            res.btn_land_class 		    = " disabled hidden ";
                    res.btn_surface_class       = " btn-outline-theme-aware ";
                    res.btn_auto_class 		    = " btn-outline-theme-aware ";
                    res.btn_guided_class 	    = " btn-outline-theme-aware ";
                    res.btn_circle_class 	    = " btn-outline-theme-aware ";
                    res.btn_brake_class 	    = " disabled hidden ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_manual_class	    = " disabled hidden ";
                    res.btn_manual_onclick      = " ";
                    res.btn_cruise_class  	    = " disabled hidden ";
                    res.btn_fbwa_class 	 	    = " disabled hidden ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden ";
                    res.btn_loiter_class 	    = " disabled hidden ";
                    res.btn_rtl_class 		    = " disabled hidden ";
                    res.btn_srtl_class 		    = " disabled hidden ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_yaw_class 	 	    = " btn-outline-theme-aware ";
                    res.btn_speed_class 	    = " btn-outline-theme-aware ";
                    break;
                case js_andruavUnit.VEHICLE_BOAT:
                case js_andruavUnit.VEHICLE_ROVER:
                    res.btn_arm_class 		    = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_climb_class 	    = " disabled hidden ";
                    res.btn_land_class 		    = " disabled hidden ";
                    res.btn_surface_class       = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-outline-theme-aware ";
                    res.btn_takeoff_class       = " disabled hidden ";
                    res.btn_guided_class 	    = " btn-outline-theme-aware ";
                    res.btn_circle_class 	    = " btn-outline-theme-aware ";
                    res.btn_manual_class	    = " btn-outline-theme-aware ";
                    res.btn_acro_class	        = " btn-outline-theme-aware ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden ";
                    res.btn_loiter_class	    = " btn-outline-theme-aware "; // used in boat only
                    res.btn_rtl_class 		    = " btn-outline-theme-aware rounded-1 ";
                    res.btn_srtl_class 		    = " btn-outline-theme-aware ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " btn-primary disabled hidden ";
                    res.btn_fbwa_class 	 	    = " btn-primary disabled hidden ";
                    res.btn_yaw_class 	 	    = " disabled hidden ";
                    res.btn_brake_class 	    = " btn-primary disabled hidden ";
                    res.btn_hold_class          = "  btn-outline-theme-aware ";
                    res.btn_speed_class	 	    = "  btn-outline-theme-aware ";
                        break;

                case js_andruavUnit.VEHICLE_TRI:
                case js_andruavUnit.VEHICLE_QUAD:
                    res.btn_takeoff_class       = " disabled hidden ";
                    res.btn_arm_class 		    = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_climb_class 	    = " btn-outline-theme-aware ";
                    res.btn_land_class 		    = " btn-outline-theme-aware ";
                    res.btn_surface_class       = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-outline-theme-aware ";
                    res.btn_guided_class 	    = " btn-outline-theme-aware ";
                    res.btn_circle_class 	    = " btn-outline-theme-aware ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_manual_class	    = " disabled hidden ";
                    res.btn_alt_hold_class      = " btn-outline-theme-aware ";
                    res.btn_pos_hold_class      = " btn-outline-theme-aware ";
                    res.btn_loiter_class 	    = " btn-outline-theme-aware ";
                    res.btn_rtl_class 		    = " btn-outline-theme-aware rounded-1 ";
                    res.btn_srtl_class 		    = " btn-outline-theme-aware ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " disabled hidden ";
                    res.btn_fbwa_class 	 	    = " disabled hidden ";
                    res.btn_yaw_class 	 	    = " btn-outline-theme-aware ";
                    res.btn_speed_class 	    = " btn-outline-theme-aware ";
                    break;

                case js_andruavUnit.VEHICLE_VTOL:
                    res.btn_arm_class 		    = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_climb_class 	    = " btn-outline-theme-aware ";
                    res.btn_takeoff_class       = " btn-outline-theme-aware ";
                    res.btn_land_class 		    = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-outline-theme-aware ";
                    res.btn_guided_class 	    = " btn-outline-theme-aware ";
                    res.btn_manual_class	    = " btn-outline-theme-aware ";
                    res.btn_stabilize_class     = " btn-outline-theme-aware ";
                    res.btn_brake_class 	    = " disabled hidden ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden ";
                    res.btn_loiter_class 	    = " btn-outline-theme-aware ";
                    res.btn_rtl_class 		    = " btn-outline-theme-aware rounded-1 ";
                    res.btn_srtl_class 		    = " btn-outline-theme-aware ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " btn-outline-theme-aware ";
                    res.btn_fbwa_class 	 	    = " btn-outline-theme-aware ";
                    res.btn_yaw_class 	 	    = " disabled hidden   ";
                    res.btn_speed_class 	    = " btn-outline-theme-aware ";

                    res.btn_q_stabilize         = " btn-outline-theme-aware ";
                    res.btn_q_loiter            = " btn-outline-theme-aware ";
                    res.btn_q_hover             = " btn-outline-theme-aware ";
                    res.btn_q_land              = " btn-outline-theme-aware ";
                    res.btn_q_rtl               = " btn-outline-theme-aware ";
                    break;

                case js_andruavUnit.VEHICLE_PLANE:
                    res.btn_arm_class 		    = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_climb_class 	    = " btn-outline-theme-aware ";
                    res.btn_takeoff_class       = " btn-outline-theme-aware ";
                    res.btn_land_class 		    = " disabled hidden ";
                    res.btn_auto_class 		    = " btn-outline-theme-aware ";
                    res.btn_guided_class 	    = " btn-outline-theme-aware ";
                    res.btn_manual_class	    = " btn-outline-theme-aware ";
                    res.btn_stabilize_class     = " btn-outline-theme-aware ";
                    res.btn_brake_class 	    = " disabled hidden ";
                    res.btn_hold_class 	        = " disabled hidden ";
                    res.btn_alt_hold_class      = " disabled hidden ";
                    res.btn_pos_hold_class      = " disabled hidden ";
                    res.btn_loiter_class 	    = " btn-outline-theme-aware ";
                    res.btn_rtl_class 		    = " btn-outline-theme-aware ";
                    res.btn_srtl_class 		    = " btn-outline-theme-aware ";
                    res.btn_takeCTRL_class      = ((c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_CENTER_CHANNELS) || (c_manualTXBlockedSubAction === js_andruavMessages.CONST_RC_SUB_ACTION_FREEZE_CHANNELS))?" btn-danger   ":" btn-primary   ";
                    res.btn_cruise_class  	    = " btn-outline-theme-aware ";
                    res.btn_fbwa_class 	 	    = " btn-outline-theme-aware ";
                    res.btn_yaw_class 	 	    = " disabled hidden   ";
                    res.btn_speed_class 	    = " btn-outline-theme-aware ";

                    res.btn_q_stabilize         = " disabled hidden ";
                    res.btn_q_loiter            = " disabled hidden ";
                    res.btn_q_hover             = " disabled hidden ";
                    res.btn_q_land              = " disabled hidden ";
                    res.btn_q_rtl               = " disabled hidden ";
                    break;
        
                default: 
                    break;
            } 				

		}





        // Activate buttons based on ACTIVE flight mode
		const currentFlightMode = p_andruavUnit.m_flightMode;

		res.btn_auto_class = this.hlp_adjustFlightModeButtonClass(res.btn_auto_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_AUTO);
		res.btn_guided_class = this.hlp_adjustFlightModeButtonClass(res.btn_guided_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_GUIDED);
		res.btn_circle_class = this.hlp_adjustFlightModeButtonClass(res.btn_circle_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_CIRCLE);
		res.btn_brake_class = this.hlp_adjustFlightModeButtonClass(res.btn_brake_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_BRAKE);
		res.btn_hold_class = this.hlp_adjustFlightModeButtonClass(res.btn_hold_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_HOLD);
		res.btn_manual_class = this.hlp_adjustFlightModeButtonClass(res.btn_manual_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_MANUAL);
		res.btn_acro_class = this.hlp_adjustFlightModeButtonClass(res.btn_acro_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_ACRO);
		res.btn_stabilize_class = this.hlp_adjustFlightModeButtonClass(res.btn_stabilize_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_STABILIZE);
		res.btn_alt_hold_class = this.hlp_adjustFlightModeButtonClass(res.btn_alt_hold_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_ALT_HOLD);
		res.btn_pos_hold_class = this.hlp_adjustFlightModeButtonClass(res.btn_pos_hold_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_POSTION_HOLD);
		res.btn_loiter_class = this.hlp_adjustFlightModeButtonClass(res.btn_loiter_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_LOITER);
		res.btn_rtl_class = this.hlp_adjustFlightModeButtonClass(res.btn_rtl_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_RTL);
		res.btn_srtl_class = this.hlp_adjustFlightModeButtonClass(res.btn_srtl_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_SMART_RTL);
		res.btn_cruise_class = this.hlp_adjustFlightModeButtonClass(res.btn_cruise_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_CRUISE);
		res.btn_fbwa_class = this.hlp_adjustFlightModeButtonClass(res.btn_fbwa_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_FBWA);
		res.btn_takeoff_class = this.hlp_adjustFlightModeButtonClass(res.btn_takeoff_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_TAKEOFF);
		res.btn_land_class = this.hlp_adjustFlightModeButtonClass(res.btn_land_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_LAND);
		res.btn_surface_class = this.hlp_adjustFlightModeButtonClass(res.btn_surface_class, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_SURFACE);

		res.btn_q_stabilize = this.hlp_adjustFlightModeButtonClass(res.btn_q_stabilize, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_QSTABILIZE);
		res.btn_q_loiter = this.hlp_adjustFlightModeButtonClass(res.btn_q_loiter, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_QLOITER);
		res.btn_q_hover = this.hlp_adjustFlightModeButtonClass(res.btn_q_hover, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_QHOVER);
		res.btn_q_land = this.hlp_adjustFlightModeButtonClass(res.btn_q_land, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_QLAND);
		res.btn_q_rtl = this.hlp_adjustFlightModeButtonClass(res.btn_q_rtl, currentFlightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_QRTL);

	    return res;
	}


    fn_applyAction(v_andruavUnit, actionCallback) {
        if (v_andruavUnit === null || v_andruavUnit === undefined || typeof actionCallback !== 'function') {
            return;
        }

        if (this.state.m_applyOnAllSameType === true && js_globals.m_andruavUnitList && typeof js_globals.m_andruavUnitList.fn_getUnitValues === 'function') {
            const units = js_globals.m_andruavUnitList.fn_getUnitValues() || [];
            units.forEach((unit) => {
                if (unit && unit.m_VehicleType === v_andruavUnit.m_VehicleType) {
                    actionCallback(unit);
                }
            });
            // For safety: uncheck the "apply to all" checkbox after each multi-unit action
            this.setState({ m_applyOnAllSameType: false });
        }
        else {
            actionCallback(v_andruavUnit);
        }
    }

    fn_auditArmAction(v_andruavUnit, level, message) {
        if (v_andruavUnit === null || v_andruavUnit === undefined) return;
        fn_auditAction(level, v_andruavUnit.getPartyID ? v_andruavUnit.getPartyID() : '', message);
    }

    fn_canArmDisarm(v_andruavUnit, actionLabel = 'ARM/DISARM') {
        if (js_andruavAuth.fn_canExecuteAction('arm_disarm') === true) return true;
        const role = js_andruavAuth.fn_getRole();
        this.fn_auditArmAction(
            v_andruavUnit,
            'warn',
            `[${role}] blocked ${actionLabel} for ${v_andruavUnit?.m_unitName || 'unit'}`
        );
        return false;
    }

    fn_ToggleArm(v_andruavUnit) {
        if (this.fn_canArmDisarm(v_andruavUnit) !== true) return;
        if (this.props.v_andruavUnit !== null && this.props.v_andruavUnit  !== undefined) {
            if (this.props.v_andruavUnit.m_isArmed) {
                this.fn_doDisarm(v_andruavUnit);
            }
            else {
                this.fn_doArm(v_andruavUnit);
            }
        }
    }


    fn_doConfirmMode(v_andruavUnit, fn_callback)
    {
        if (v_andruavUnit !== null && v_andruavUnit !== undefined) {
            fn_do_modal_confirmation("DANGEROUS-YOU NEED TO CONTROL DRONE " + v_andruavUnit.m_unitName + "   " + v_andruavUnit.m_VehicleType_TXT,
                "Are You SURE?", function (p_approved) {
                    if (p_approved === false) 
                    {
                       return;
                    }
                    else
                    {
					    js_speak.fn_speak('DANGEROUS ACRO MODEL');
                        fn_callback(v_andruavUnit);
                        return ;
                    }
                }, "CONFIRM", "bg-danger txt-theme-aware", "Cancel");
        }
    }

    fn_doArm(v_andruavUnit) {
        if (this.fn_canArmDisarm(v_andruavUnit, 'ARM') !== true) return;
        if (v_andruavUnit !== null && v_andruavUnit !== undefined) {
            this.fn_applyAction(v_andruavUnit, (unit) => {
                const sent = js_globals.v_andruavFacade.API_do_Arm(unit, true, false);
                this.fn_auditArmAction(unit, sent === true ? 'warn' : 'error', `${sent === true ? 'ARM requested' : 'ARM send failed'} for ${unit.m_unitName}`);
            });
        }
    }

    fn_doDisarm(v_andruavUnit) {
        if (this.fn_canArmDisarm(v_andruavUnit, 'DISARM') !== true) return;
        if (v_andruavUnit !== null && v_andruavUnit !== undefined) {
            this.fn_applyAction(v_andruavUnit, (unit) => {
                const sent = js_globals.v_andruavFacade.API_do_Arm(unit, false, false);
                this.fn_auditArmAction(unit, sent === true ? 'warn' : 'error', `${sent === true ? 'DISARM requested' : 'DISARM send failed'} for ${unit.m_unitName}`);
            });
        }
    }

    fn_doTakeOffPlane(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_TAKEOFF);
        });
    }

    fn_doLand(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_Land(unit);
        });
    }

    fn_doSurface(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_SURFACE);
        });
    }

    fn_doManual(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_MANUAL);
        });
    }

    fn_doAcro(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_ACRO);
        });
    }

    fn_doStabilize(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_STABILIZE);
        });
    }
    
    fn_doAltHold(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_ALT_HOLD);
        });
    }
    
    fn_doRTL(v_andruavUnit, smart) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, smart === true ? js_andruavUnit.CONST_FLIGHT_CONTROL_SMART_RTL : js_andruavUnit.CONST_FLIGHT_CONTROL_RTL);
        });
    }


    fn_doCruise(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_CRUISE);
        });
    }


    fn_doCircle(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_CIRCLE);
        });
    }

    fn_doFBWA(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_FBWA);
        });
    }

    fn_doFBWB(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_FBWB);
        });
    }


    fn_doQStabilize(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_QSTABILIZE);
        });
    }
    fn_doQLoiter(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_QLOITER);
        });
    }
    fn_doQHover(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_QHOVER);
        });
    }
    fn_doQLand(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_QLAND);
        });
    }
    fn_doQRTL(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_QRTL);
        });
    }

    
    

    fn_doGuided(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_GUIDED);
        });
    }

    fn_doAuto(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_AUTO);
        });
    }

    fn_doPosHold(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_POSTION_HOLD);
        });
    }

    fn_doLoiter(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_LOITER);
        });
    }

    fn_doBrake(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_BRAKE);
        });
    }

    fn_doHold(v_andruavUnit) {
        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_HOLD);
        });
    }

    fn_ServoControl(p_andruavUnit)
    {
        js_eventEmitter.fn_dispatch (js_event.EE_displayServoForm, p_andruavUnit.getPartyID());
    }

    fn_changeAltitudeWrapper(v_andruavUnit) {
        if (v_andruavUnit === null || v_andruavUnit === undefined) return;
        if (this.state.m_isClimbEditorOpen === true) {
            this.setState({ m_isClimbEditorOpen: false });
            return;
        }

        const relativeAltMeters = Number(v_andruavUnit?.m_Nav_Info?.p_Location?.alt_relative ?? 0);
        const useMetric = js_globals.v_useMetricSystem !== false;
        const displayUnit = useMetric ? 'm' : 'ft';
        const displayValue = useMetric ? relativeAltMeters : (relativeAltMeters * js_helpers.CONST_METER_TO_FEET);
        const safeDisplayValue = Number.isFinite(displayValue) ? displayValue : 0;
        const defaultDisplayValue = this.fn_getDefaultClimbDisplayValue(displayUnit);
        const maxByCurrent = safeDisplayValue + (useMetric ? 150 : 500);
        const maxByDefault = defaultDisplayValue + (useMetric ? 150 : 500);
        const defaultMax = useMetric ? 300 : 1000;
        const displayMax = Math.max(defaultMax, Math.ceil(Math.max(maxByCurrent, maxByDefault) / 5) * 5);
        const defaultInputValue = Math.min(displayMax, Math.max(0, defaultDisplayValue));

        this.setState({
            m_isClimbEditorOpen: true,
            m_climbAltitudeInput: defaultInputValue.toFixed(useMetric ? 1 : 0),
            m_climbAltitudeMin: 0,
            m_climbAltitudeMax: displayMax,
            m_climbAltitudeUnit: displayUnit
        }, () => {
            this.fn_repositionClimbEditor();
        });
    }

    fn_repositionClimbEditor = () => {
        if (this.state.m_isClimbEditorOpen !== true) return;

        const mapHost = document.getElementById('div_map_view');
        const rightPanel = document.getElementById('row_2');
        const quickTools = mapHost ? mapHost.querySelector('.nb-map-quick-tools') : null;
        if (mapHost === null || mapHost === undefined) return;

        const mapRect = mapHost.getBoundingClientRect();
        const rightRect = rightPanel ? rightPanel.getBoundingClientRect() : null;
        const quickToolsRect = quickTools ? quickTools.getBoundingClientRect() : null;
        const panelWidth = 208;
        const edgeGap = 14;

        if (mapRect.width < 80 || mapRect.height < 120) return;

        const minLeft = mapRect.left + edgeGap;
        const maxLeft = mapRect.right - panelWidth - edgeGap;
        const boundedMaxLeft = Math.max(minLeft, maxLeft);
        let nextLeft = maxLeft;
        if (rightRect && Number.isFinite(rightRect.left)) {
            const betweenLeft = rightRect.left - panelWidth - edgeGap;
            if (betweenLeft > minLeft) {
                nextLeft = betweenLeft;
            }
        }
        nextLeft = Math.min(boundedMaxLeft, Math.max(minLeft, nextLeft));

        // Keep climb editor below map quick tools (center/focus buttons).
        let nextTop = Math.max(70, mapRect.top + edgeGap);
        if (quickToolsRect) {
            nextTop = Math.max(nextTop, quickToolsRect.bottom + edgeGap);
        }

        const panelMinHeight = 220;
        const maxTop = Math.max(mapRect.top + edgeGap, mapRect.bottom - edgeGap - panelMinHeight);
        nextTop = Math.max(mapRect.top + edgeGap, Math.min(nextTop, maxTop));
        const nextMaxHeight = Math.max(220, Math.round(mapRect.bottom - edgeGap - nextTop));
        const roundedLeft = Math.round(nextLeft);
        const roundedTop = Math.round(nextTop);

        if (
            this.state.m_climbEditorLeft === roundedLeft &&
            this.state.m_climbEditorTop === roundedTop &&
            this.state.m_climbEditorMaxHeight === nextMaxHeight
        ) {
            return;
        }

        this.setState({
            m_climbEditorLeft: roundedLeft,
            m_climbEditorTop: roundedTop,
            m_climbEditorMaxHeight: nextMaxHeight
        });
    }

    componentDidMount() {
        window.addEventListener('resize', this.fn_repositionClimbEditor);
        window.addEventListener('scroll', this.fn_repositionClimbEditor, true);
    }

    componentDidUpdate(prevProps, prevState) {
        if (
            this.state.m_isClimbEditorOpen === true &&
            (
                prevState.m_isClimbEditorOpen !== this.state.m_isClimbEditorOpen ||
                prevState.m_climbAltitudeInput !== this.state.m_climbAltitudeInput ||
                prevProps.v_andruavUnit?.getPartyID?.() !== this.props.v_andruavUnit?.getPartyID?.()
            )
        ) {
            this.fn_repositionClimbEditor();
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.fn_repositionClimbEditor);
        window.removeEventListener('scroll', this.fn_repositionClimbEditor, true);
    }

    fn_clampClimbDisplayValue(value) {
        const minVal = Number(this.state.m_climbAltitudeMin ?? 0);
        const maxVal = Number(this.state.m_climbAltitudeMax ?? minVal);
        return Math.min(maxVal, Math.max(minVal, value));
    }

    fn_formatClimbDisplayValue(value) {
        const useMetric = this.state.m_climbAltitudeUnit === 'm';
        return Number(value).toFixed(useMetric ? 1 : 0);
    }

    fn_adjustClimbAltitude(delta) {
        const current = parseFloat(this.state.m_climbAltitudeInput);
        if (Number.isFinite(current) !== true) return;
        const nextValue = this.fn_clampClimbDisplayValue(current + delta);
        this.setState({ m_climbAltitudeInput: this.fn_formatClimbDisplayValue(nextValue) });
    }

    fn_getDefaultClimbDisplayValue(displayUnit) {
        const rawDefaultAltitude = Number(js_globals.CONST_DEFAULT_ALTITUDE);
        if (Number.isFinite(rawDefaultAltitude) === true) {
            return Math.max(0, rawDefaultAltitude);
        }

        if (displayUnit === 'ft') {
            return Math.max(0, (100 * js_helpers.CONST_METER_TO_FEET));
        }
        return 100;
    }

    fn_getDefaultClimbAltitudeMeters() {
        const displayUnit = this.state.m_climbAltitudeUnit || (js_globals.v_useMetricSystem !== false ? 'm' : 'ft');
        const defaultDisplayValue = this.fn_getDefaultClimbDisplayValue(displayUnit);
        const defaultMeters = fn_convertToMeter(defaultDisplayValue);
        if (Number.isFinite(defaultMeters) !== true) return 0;
        return Math.max(0, defaultMeters);
    }

    fn_applyDefaultClimbAltitude(v_andruavUnit) {
        if (v_andruavUnit === null || v_andruavUnit === undefined) return;

        const altitudeMeters = this.fn_getDefaultClimbAltitudeMeters();
        const altitudeCommand = (v_andruavUnit.m_VehicleType === js_andruavUnit.VEHICLE_SUBMARINE)
            ? -Math.abs(altitudeMeters)
            : Math.max(0, altitudeMeters);

        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_ChangeAltitude(unit, altitudeCommand);
        });

        const defaultDisplayValue = this.fn_getDefaultClimbDisplayValue(this.state.m_climbAltitudeUnit);
        this.setState({
            m_climbAltitudeInput: this.fn_formatClimbDisplayValue(this.fn_clampClimbDisplayValue(defaultDisplayValue)),
            m_isClimbEditorOpen: false
        });
    }

    fn_cancelClimbAltitude() {
        this.setState({ m_isClimbEditorOpen: false });
    }

    fn_applyClimbAltitude(v_andruavUnit) {
        if (v_andruavUnit === null || v_andruavUnit === undefined) return;

        const parsedDisplayValue = parseFloat(this.state.m_climbAltitudeInput);
        if (Number.isFinite(parsedDisplayValue) !== true) return;

        const clampedDisplayValue = this.fn_clampClimbDisplayValue(parsedDisplayValue);
        const altitudeMeters = (this.state.m_climbAltitudeUnit === 'm')
            ? clampedDisplayValue
            : (clampedDisplayValue * js_helpers.CONST_FEET_TO_METER);
        const altitudeCommand = (v_andruavUnit.m_VehicleType === js_andruavUnit.VEHICLE_SUBMARINE)
            ? -Math.abs(altitudeMeters)
            : Math.max(0, altitudeMeters);

        this.fn_applyAction(v_andruavUnit, (unit) => {
            js_globals.v_andruavFacade.API_do_ChangeAltitude(unit, altitudeCommand);
        });

        this.setState({
            m_climbAltitudeInput: this.fn_formatClimbDisplayValue(clampedDisplayValue),
            m_isClimbEditorOpen: false
        });
    }

    fn_changeSpeedWrapper(v_andruavUnit) {
        const initSpeed = v_andruavUnit.m_Nav_Info.p_Location.ground_speed != null ? v_andruavUnit.m_Nav_Info.p_Location.ground_speed : v_andruavUnit.m_gui.speed_link;

        if (this.state.m_applyOnAllSameType === true) {
            const me = this;
            fn_changeSpeed(v_andruavUnit, initSpeed, function (p_baseUnit, p_speedCmd) {
                me.fn_applyAction(v_andruavUnit, function (unit) {
                    unit.m_Nav_Info.p_UserDesired.m_NavSpeed = p_speedCmd;
                    js_globals.v_andruavFacade.API_do_ChangeSpeed2(unit, p_speedCmd);
                });
            });
        }
        else {
            fn_changeSpeed(v_andruavUnit, initSpeed);
        }
    }

    fn_doYawWrapper(v_andruavUnit) {
        if (this.state.m_applyOnAllSameType === true) {
            const me = this;
            gui_doYAW(v_andruavUnit.getPartyID(), function (p_baseUnit, p_targetAngle) {
                me.fn_applyAction(v_andruavUnit, function (unit) {
                    if (p_targetAngle === -1) {
                        // Reset yaw: keep original behavior
                        fn_doYAW(unit, -1, 0, true, false);
                    }
                    else {
                        // Compute direction per-unit based on its own current heading
                        const target_angle_deg = parseFloat(p_targetAngle);
                        const current_angle_deg = (js_helpers.CONST_RADIUS_TO_DEGREE * ((unit.m_Nav_Info.p_Orientation.yaw + js_helpers.CONST_PTx2) % js_helpers.CONST_PTx2)).toFixed(1);
                        let direction = js_helpers.isClockwiseAngle(current_angle_deg, target_angle_deg);
                        fn_doYAW(unit, p_targetAngle, 0, !direction, false);
                    }
                });
            });
        }
        else {
            gui_doYAW(v_andruavUnit.getPartyID());
        }
    }

    render ()
    {
        const btn = this.hlp_getflightButtonStyles(this.props.v_andruavUnit);
        const armButtonLabel = this.props.v_andruavUnit.m_isArmed === true ? 'Disarm' : 'Arm';
        const canArmDisarm = js_andruavAuth.fn_canExecuteAction('arm_disarm') === true;
        const role = js_andruavAuth.fn_getRole();
        const armTitle = canArmDisarm === true
            ? `Hold to ${armButtonLabel.toLowerCase()} ${this.props.v_andruavUnit.m_unitName}`
            : `Role ${role} cannot ${armButtonLabel.toLowerCase()} ${this.props.v_andruavUnit.m_unitName}`;
        const armControl = (
            <ClssSafetyHoldButton
                id='btn_arm'
                className={'btn btn-sm flgtctrlbtn bi bi-power ' + btn.btn_arm_class}
                title={armTitle}
                disabled={canArmDisarm !== true}
                onConfirm={() => this.fn_ToggleArm(this.props.v_andruavUnit)}
            >
                &nbsp;{armButtonLabel}&nbsp;
            </ClssSafetyHoldButton>
        );
        const defaultClimbDisplayValue = this.fn_getDefaultClimbDisplayValue(js_globals.v_useMetricSystem !== false ? 'm' : 'ft');
        const defaultClimbLabel = (js_globals.v_useMetricSystem !== false)
            ? `${defaultClimbDisplayValue.toFixed(0)} m`
            : `${defaultClimbDisplayValue.toFixed(0)} ft`;
        const climbButtonDisabled = typeof btn.btn_climb_class === 'string'
            ? btn.btn_climb_class.includes('disabled')
            : false;
        const climbTitle = `Click to open altitude editor. Hold to set ${this.props.v_andruavUnit.m_unitName} altitude to default (${defaultClimbLabel}).`;
        const climbControl = (
            <ClssSafetyHoldButton
                id='btn_climb'
                className={'btn btn-sm flgtctrlbtn bi bi-arrow-bar-up ' + btn.btn_climb_class}
                title={climbTitle}
                disabled={climbButtonDisabled}
                onTap={() => this.fn_changeAltitudeWrapper(this.props.v_andruavUnit)}
                onConfirm={() => this.fn_applyDefaultClimbAltitude(this.props.v_andruavUnit)}
            >
                &nbsp;{btn.btn_climb_text}&nbsp;
            </ClssSafetyHoldButton>
        );
        const climbStepSet = this.state.m_climbAltitudeUnit === 'm'
            ? [-20, -10, -5, 5, 10, 20]
            : [-50, -25, -10, 10, 25, 50];
        const decreaseSteps = climbStepSet.filter((stepVal) => stepVal < 0).sort((a, b) => a - b);
        const increaseSteps = climbStepSet.filter((stepVal) => stepVal > 0).sort((a, b) => a - b);
        const currentClimbValue = Number.isFinite(parseFloat(this.state.m_climbAltitudeInput))
            ? parseFloat(this.state.m_climbAltitudeInput)
            : this.state.m_climbAltitudeMin;
        const climbEditor = this.state.m_isClimbEditorOpen === true ? (
            <div
                className='nb-climb-editor nb-climb-editor--floating'
                style={{
                    top: `${this.state.m_climbEditorTop}px`,
                    left: `${this.state.m_climbEditorLeft}px`,
                    maxHeight: `${this.state.m_climbEditorMaxHeight}px`
                }}
            >
                <div className='nb-climb-editor__header'>
                    <span className='nb-climb-editor__title'>Set Altitude (rel)</span>
                    <button
                        type='button'
                        className='btn btn-sm btn-outline-theme-aware nb-climb-editor__close'
                        onClick={() => this.fn_cancelClimbAltitude()}
                    >
                        <i className='bi bi-x-lg'></i>
                    </button>
                </div>
                <div className='nb-climb-editor__input-row'>
                    <input
                        type='number'
                        className='form-control form-control-sm nb-climb-editor__input'
                        min={this.state.m_climbAltitudeMin}
                        max={this.state.m_climbAltitudeMax}
                        step={this.state.m_climbAltitudeUnit === 'm' ? '0.5' : '1'}
                        value={this.state.m_climbAltitudeInput}
                        onChange={(e) => this.setState({ m_climbAltitudeInput: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                this.fn_applyClimbAltitude(this.props.v_andruavUnit);
                            }
                        }}
                    />
                    <span className='nb-climb-editor__unit'>{this.state.m_climbAltitudeUnit}</span>
                </div>
                <div className='nb-climb-editor__slider-wrap'>
                    <span className='nb-climb-editor__scale nb-climb-editor__scale--max'>{this.fn_formatClimbDisplayValue(this.state.m_climbAltitudeMax)}</span>
                    <input
                        type='range'
                        className='nb-climb-editor__slider'
                        min={this.state.m_climbAltitudeMin}
                        max={this.state.m_climbAltitudeMax}
                        step={this.state.m_climbAltitudeUnit === 'm' ? '0.5' : '1'}
                        value={currentClimbValue}
                        onChange={(e) => this.setState({ m_climbAltitudeInput: this.fn_formatClimbDisplayValue(parseFloat(e.target.value)) })}
                    />
                    <span className='nb-climb-editor__scale nb-climb-editor__scale--min'>{this.fn_formatClimbDisplayValue(this.state.m_climbAltitudeMin)}</span>
                </div>
                <div className='nb-climb-editor__chips-groups'>
                    <div className='nb-climb-editor__chips-group'>
                        <div className='nb-climb-editor__chips-title'>Decrease</div>
                        <div className='nb-climb-editor__chips'>
                            {decreaseSteps.map((stepVal) => (
                                <button
                                    key={`climb_step_${stepVal}`}
                                    type='button'
                                    className='btn btn-sm btn-outline-theme-aware nb-climb-editor__chip nb-climb-editor__chip--decrease'
                                    onClick={() => this.fn_adjustClimbAltitude(stepVal)}
                                >
                                    {stepVal}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className='nb-climb-editor__chips-group'>
                        <div className='nb-climb-editor__chips-title'>Increase</div>
                        <div className='nb-climb-editor__chips'>
                            {increaseSteps.map((stepVal) => (
                                <button
                                    key={`climb_step_${stepVal}`}
                                    type='button'
                                    className='btn btn-sm btn-outline-theme-aware nb-climb-editor__chip nb-climb-editor__chip--increase'
                                    onClick={() => this.fn_adjustClimbAltitude(stepVal)}
                                >
                                    {`+${stepVal}`}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className='nb-climb-editor__actions'>
                    <button type='button' className='btn btn-sm btn-outline-theme-aware' onClick={() => this.fn_cancelClimbAltitude()}>Cancel</button>
                    <button type='button' className='btn btn-sm btn-primary' onClick={() => this.fn_applyClimbAltitude(this.props.v_andruavUnit)}>Set Altitude</button>
                </div>
            </div>
        ) : null;
        const climbEditorHost = (typeof document !== 'undefined') ? document.body : null;
        const climbEditorPortal = (climbEditor !== null && climbEditorHost !== null)
            ? createPortal(climbEditor, climbEditorHost)
            : null;
        let ctrl=[];
        const hasSameTypeUnits = this.state.m_hasSameTypeUnits;
        
        switch (this.props.v_andruavUnit.m_VehicleType)
        {
            case js_andruavUnit.VEHICLE_QUAD:
            case js_andruavUnit.VEHICLE_TRI:
    {
                ctrl.push(<div key={this.props.id+"rc1"}  id={this.props.id+"rc1"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap '>
                    {armControl}
                    {climbControl}
                    <button id='btn_takeoff' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_takeoff_class } onClick={ () => this.fn_doTakeOffPlane(this.props.v_andruavUnit)}>&nbsp;TakeOff&nbsp;</button>
                    <button id='btn_land' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-bar-down ' + btn.btn_land_class } onClick={ () => this.fn_doLand(this.props.v_andruavUnit)}>&nbsp;Land&nbsp;</button>
                    <button id='btn_surface' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_surface_class } onClick={ () => this.fn_doSurface(this.props.v_andruavUnit)}>&nbsp;Surface&nbsp;</button>
                    <button id='btn_auto' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_class } onClick={ () => this.fn_doAuto(this.props.v_andruavUnit)}>&nbsp;Auto&nbsp;</button>
                    <button id='btn_guided' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_guided_class } onClick={ () => this.fn_doGuided(this.props.v_andruavUnit)}>&nbsp;Guided </button>
                    <button id='btn_break' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-stop-btn' + btn.btn_brake_class } onClick={ () => this.fn_doBrake(this.props.v_andruavUnit)}>&nbsp;Brake&nbsp;</button>
                    <button id='btn_circle' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_circle_class } onClick={ () => this.fn_doCircle(this.props.v_andruavUnit)}>&nbsp;Circle </button>
                    <button id='btn_hold' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_hold_class } onClick={ () => this.fn_doHold(this.props.v_andruavUnit)}>&nbsp;Hold&nbsp;</button>
                    </div></div>);

                ctrl.push(<div key={this.props.id+"rc2"}   id={this.props.id+"rc2"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap'>
                    <button id='btn_posh' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_pos_hold_class } onClick={ () => this.fn_doPosHold(this.props.v_andruavUnit)}>&nbsp;Pos-H&nbsp;</button>
                    <button id='btn_loiter' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_loiter_class } onClick={ () => this.fn_doLoiter(this.props.v_andruavUnit)}>&nbsp;Loiter&nbsp;</button>
                    <button id='btn_manual' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_manual_class } onClick={ () => this.fn_doManual(this.props.v_andruavUnit)}>&nbsp;Manual&nbsp;</button>
                    <button id='btn_acro' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_acro_class } onClick={ () => this.fn_doConfirmMode(this.props.v_andruavUnit, this.fn_doAcro.bind(this))}>&nbsp;Acro&nbsp;</button>
                    <button id='btn_stabilize' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_stabilize_class } onClick={ () => this.fn_doConfirmMode(this.props.v_andruavUnit, this.fn_doStabilize.bind(this))}>&nbsp;Stablize&nbsp;</button>
                    <button id='btn_altHold' type='button' className={'btn btn-sm flgtctrlbtn css_ontop ' + btn.btn_alt_hold_class } onClick={ () => this.fn_doAltHold(this.props.v_andruavUnit)}>&nbsp;Alt-H&nbsp;</button>
                    <button id='btn_rtl' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-90deg-left' + btn.btn_rtl_class } title="RTL mode"  onClick={ () => this.fn_doRTL(this.props.v_andruavUnit, false)}>&nbsp;RTL&nbsp;</button>
                    <button id='btn_rtl_s' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-90deg-left' + btn.btn_srtl_class } title="Smart RTL"  onClick={ () => this.fn_doRTL(this.props.v_andruavUnit, true)}>&nbsp;S-RTL&nbsp;</button>
                    <button id='btn_cruse' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_cruise_class } onClick={ () => this.fn_doCruise(this.props.v_andruavUnit)}>&nbsp;Cruise&nbsp;</button>
                    <button id='btn_fbwa' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_fbwa_class } onClick={ () => this.fn_doFBWA(this.props.v_andruavUnit)}>&nbsp;FBWA&nbsp;</button>
                    <button id='btn_fbwb' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_fbwa_class } onClick={ () => this.fn_doFBWB(this.props.v_andruavUnit)}>&nbsp;FBWB&nbsp;</button>
                    </div></div>);

                
                ctrl.push(<div key={this.props.id+"rc3"}   id={this.props.id+"rc3"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap'>
                    <button id='btn_yaw' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-clockwise w-25 me-1' + btn.btn_yaw_class } onClick={ () => this.fn_doYawWrapper(this.props.v_andruavUnit)}>&nbsp;YAW&nbsp;</button>
                    <button id='btn_speed' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-speedometer2 w-25 me-1' + btn.btn_speed_class } onClick={ () => fn_changeSpeed(this.props.v_andruavUnit,this.props.v_andruavUnit.m_Nav_Info.p_Location.ground_speed!=null?this.props.v_andruavUnit.m_Nav_Info.p_Location.ground_speed:this.props.v_andruavUnit.m_gui.speed_link)}>&nbsp;GS&nbsp;</button>
                    <button id='btn_servos' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-sliders2-vertical w-25' + btn.btn_servo_class } onClick={ () => this.fn_ServoControl(this.props.v_andruavUnit)}>&nbsp;SRV&nbsp;</button>
                    </div></div>);
                    }
            break;
            case js_andruavUnit.VEHICLE_VTOL:
            case  js_andruavUnit.VEHICLE_PLANE:
                {
                ctrl.push(<div key={this.props.id+"rc1"} id={this.props.id+"rc1"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap'>
                    {armControl}
                    {climbControl}
                    <button id='btn_takeoff' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_takeoff_class } onClick={ () => this.fn_doTakeOffPlane(this.props.v_andruavUnit)}>&nbsp;TakeOff&nbsp;</button>
                    <button id='btn_land' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-bar-down ' + btn.btn_land_class } onClick={ () => this.fn_doLand(this.props.v_andruavUnit)}>&nbsp;Land&nbsp;</button>
                    <button id='btn_surface' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_surface_class } onClick={ () => this.fn_doSurface(this.props.v_andruavUnit)}>&nbsp;Surface&nbsp;</button>
                    <button id='btn_auto' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_class } onClick={ () => this.fn_doAuto(this.props.v_andruavUnit)}>&nbsp;Auto&nbsp;</button>
                    <button id='btn_guided' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_guided_class } onClick={ () => this.fn_doGuided(this.props.v_andruavUnit)}>&nbsp;Guided </button>
                    <button id='btn_break' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-stop-btn ' + btn.btn_brake_class } onClick={ () => this.fn_doBrake(this.props.v_andruavUnit)}>&nbsp;Brake&nbsp;</button>
                    <button id='btn_circle' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_circle_class } onClick={ () => this.fn_doCircle(this.props.v_andruavUnit)}>&nbsp;Circle </button>
                    <button id='btn_hold' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_hold_class } onClick={ () => this.fn_doHold(this.props.v_andruavUnit)}>&nbsp;Hold&nbsp;</button>
                    <button id='btn_loiter' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_loiter_class } onClick={ () => this.fn_doLoiter(this.props.v_andruavUnit)}>&nbsp;Loiter&nbsp;</button>
                    </div></div>);
        
                ctrl.push(<div key={this.props.id+"rc2"}  id={this.props.id+"rc2"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap'>
                    <button id='btn_posh' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_pos_hold_class } onClick={ () => this.fn_doPosHold(this.props.v_andruavUnit)}>&nbsp;Pos-H&nbsp;</button>
                    <button id='btn_manual' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_manual_class } onClick={ () => this.fn_doManual(this.props.v_andruavUnit)}>&nbsp;Manual&nbsp;</button>
                    <button id='btn_stabilize' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_stabilize_class } onClick={ () => this.fn_doStabilize(this.props.v_andruavUnit)}>&nbsp;Stabilize&nbsp;</button>
                    <button id='btn_rtl' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-90deg-left' + btn.btn_rtl_class } title="RTL mode"  onClick={ () => this.fn_doRTL(this.props.v_andruavUnit, false)}>&nbsp;RTL&nbsp;</button>
                    <button id='btn_rtl_s' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-90deg-left' + btn.btn_srtl_class } title="Smart RTL"  onClick={ () => this.fn_doRTL(this.props.v_andruavUnit, true)}>&nbsp;S-RTL&nbsp;</button>
                    <button id='btn_cruse' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_cruise_class } onClick={ () => this.fn_doCruise(this.props.v_andruavUnit)}>&nbsp;Cruise&nbsp;</button>
                    <button id='btn_fbwa' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_fbwa_class } onClick={ () => this.fn_doFBWA(this.props.v_andruavUnit)}>&nbsp;FBWA&nbsp;</button>
                    <button id='btn_fbwb' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_fbwa_class } onClick={ () => this.fn_doFBWB(this.props.v_andruavUnit)}>&nbsp;FBWB&nbsp;</button>
                    <button id='btn_yaw' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-clockwise' + btn.btn_yaw_class } onClick={ () => this.fn_doYawWrapper(this.props.v_andruavUnit)}>&nbsp;YAW&nbsp;</button>
                    <button id='btn_speed' type='button' className={'btn btn_sm  flgtctrlbtn bi bi-speedometer2' + btn.btn_speed_class } onClick={ () => this.fn_changeSpeedWrapper(this.props.v_andruavUnit)}>&nbsp;GS&nbsp;</button>
                    <button id='btn_servos' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-sliders2-vertical' + btn.btn_servo_class } onClick={ () => this.fn_ServoControl(this.props.v_andruavUnit)}>&nbsp;SRV&nbsp;</button>
                    </div></div>);
            
            
                ctrl.push(<div key={this.props.id+"rc22"} id={this.props.id+"rc22"}   className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap'>
                    <button id='btn_q_sblt' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_q_stabilize } onClick={ () => this.fn_doQStabilize(this.props.v_andruavUnit)}>&nbsp;QStab&nbsp;</button>
                    <button id='btn_q_loiter' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_q_loiter } onClick={ () => this.fn_doQLoiter(this.props.v_andruavUnit)}>&nbsp;QLoiter&nbsp;</button>
                    <button id='btn_q_hover' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_q_hover } onClick={ () => this.fn_doQHover(this.props.v_andruavUnit)}>&nbsp;QHover&nbsp;</button>
                    <button id='btn_q_land' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_q_land } title="RTL mode"  onClick={ () => this.fn_doQLand(this.props.v_andruavUnit)}>&nbsp;QLand&nbsp;</button>
                    <button id='btn_q_rtl' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_q_rtl } title="Smart RTL"  onClick={ () => this.fn_doQRTL(this.props.v_andruavUnit)}>&nbsp;QRTL&nbsp;</button>
                    </div></div>);
    
                }
                break;
                
            default:
                {
                ctrl.push(<div key={this.props.id+"rc1"}  id={this.props.id+"rc1"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap'>
                    {armControl}
                    {climbControl}
                    <button id='btn_takeoff' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_takeoff_class } onClick={ () => this.fn_doTakeOffPlane(this.props.v_andruavUnit)}>&nbsp;TakeOff&nbsp;</button>
                    <button id='btn_land' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-bar-down ' + btn.btn_land_class } onClick={ () => this.fn_doLand(this.props.v_andruavUnit)}>&nbsp;Land&nbsp;</button>
                    <button id='btn_surface' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_surface_class } onClick={ () => this.fn_doSurface(this.props.v_andruavUnit)}>&nbsp;Surface&nbsp;</button>
                    <button id='btn_auto' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_class } onClick={ () => this.fn_doAuto(this.props.v_andruavUnit)}>&nbsp;Auto&nbsp;</button>
                    <button id='btn_guided' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_guided_class } onClick={ () => this.fn_doGuided(this.props.v_andruavUnit)}>&nbsp;Guided </button>
                    <button id='btn_break' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-stop-btn' + btn.btn_brake_class } onClick={ () => this.fn_doBrake(this.props.v_andruavUnit)}>&nbsp;Brake&nbsp;</button>
                    <button id='btn_circle' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_circle_class } onClick={ () => this.fn_doCircle(this.props.v_andruavUnit)}>&nbsp;Circle </button>
                    <button id='btn_hold' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_hold_class } onClick={ () => this.fn_doHold(this.props.v_andruavUnit)}>&nbsp;Hold&nbsp;</button>
                    </div></div>);

                ctrl.push(<div key={this.props.id+"rc2"}   id={this.props.id+"rc2"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap '>
                    <button id='btn_posh' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_pos_hold_class } onClick={ () => this.fn_doPosHold(this.props.v_andruavUnit)}>&nbsp;Pos-H&nbsp;</button>
                    <button id='btn_loiter' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_loiter_class } onClick={ () => this.fn_doLoiter(this.props.v_andruavUnit)}>&nbsp;Loiter&nbsp;</button>
                    <button id='btn_manual' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_manual_class } onClick={ () => this.fn_doManual(this.props.v_andruavUnit)}>&nbsp;Manual&nbsp;</button>
                    <button id='btn_acro' type='button' className={'btn btn-sm flgtctrlbtn ' + btn.btn_acro_class } onClick={ () => this.fn_doAcro(this.props.v_andruavUnit)}>&nbsp;Acro&nbsp;</button>
                    <button id='btn_rtl' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-90deg-left' + btn.btn_rtl_class } title="RTL mode"  onClick={ () => this.fn_doRTL(this.props.v_andruavUnit, false)}>&nbsp;RTL&nbsp;</button>
                    <button id='btn_rtl_s' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-90deg-left' + btn.btn_srtl_class } title="Smart RTL"  onClick={ () => this.fn_doRTL(this.props.v_andruavUnit, true)}>&nbsp;S-RTL&nbsp;</button>
                    <button id='btn_cruse' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_cruise_class } onClick={ () => this.fn_doCruise(this.props.v_andruavUnit)}>&nbsp;Cruise&nbsp;</button>
                    <button id='btn_fbwa' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_fbwa_class } onClick={ () => this.fn_doFBWA(this.props.v_andruavUnit)}>&nbsp;FBWA&nbsp;</button>
                    <button id='btn_fbwb' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_fbwa_class } onClick={ () => this.fn_doFBWB(this.props.v_andruavUnit)}>&nbsp;FBWB&nbsp;</button>
                    <button id='btn_yaw' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-arrow-clockwise' + btn.btn_yaw_class } onClick={ () => this.fn_doYawWrapper(this.props.v_andruavUnit)}>&nbsp;YAW&nbsp;</button>
                    <button id='btn_speed' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-speedometer2' + btn.btn_speed_class } onClick={ () => fn_changeSpeed(this.props.v_andruavUnit,this.props.v_andruavUnit.m_Nav_Info.p_Location.ground_speed!=null?this.props.v_andruavUnit.m_Nav_Info.p_Location.ground_speed:this.props.v_andruavUnit.m_gui.speed_link)}>&nbsp;GS&nbsp;</button>
                    <button id='btn_servos' type='button' className={'btn btn-sm  flgtctrlbtn bi bi-sliders2-vertical' + btn.btn_servo_class } onClick={ () => this.fn_ServoControl(this.props.v_andruavUnit)}>&nbsp;SRV&nbsp;</button>
                    </div></div>);
                    }
                break;
        }
        

        return (<div key={this.props.id+"rc"}   id={this.props.id+"rc"} >
            {ctrl}
            {climbEditorPortal}
            {hasSameTypeUnits && (
                <div className='form-check mt-1'>
                    <input
                        className='form-check-input'
                        type='checkbox'
                        id={this.props.id+"applySameType"}
                        checked={this.state.m_applyOnAllSameType}
                        onChange={(e) => this.setState({ m_applyOnAllSameType: e.target.checked })}
                    />
                    <label className='form-check-label txt-theme-aware small' htmlFor={this.props.id+"applySameType"}>
                        Apply to all units of same vehicle type
                    </label>
                </div>
            )}
            </div>
        );
    }
}

