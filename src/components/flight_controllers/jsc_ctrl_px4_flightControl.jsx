
import React    from 'react';

import { js_globals } from '../../js/js_globals.js';
import { js_andruavAuth } from '../../js/js_andruav_auth.js';
import ClssSafetyHoldButton from '../common/jsc_safety_hold_button.jsx';

import {fn_auditAction, fn_changeAltitude, gui_doYAW} from '../../js/js_main'
import * as js_andruavUnit from '../../js/js_andruavUnit.js';

export class ClssCtrlPx4FlightControl extends React.Component {
    constructor()
	{
		super ();
		    this.state = {
		};
    }

    hlp_getflightButtonStyles (p_andruavUnit)
	{
	    let res = {};
		res.btn_arm_class                   = "";
        res.btn_takeoff_class               = "";
		res.btn_climb_text                  = "Climb";
		res.btn_manual_ctl_class            = "";
        res.btn_acro_ctl_class              = "";
        res.btn_stabilize_class             = "";
        res.btn_alt_ctl_class               = "";
        res.btn_r_attd_class                = "";
        res.btn_auto_takeoff_class          = "";
        res.btn_auto_land_class             = "";
        res.btn_auto_hold_class 	        = "";
        res.btn_auto_mission_class          = "";
        res.btn_auto_rtl_class              = "";
        res.btn_auto_vtol_takeoff_class     = "";
        res.btn_pos_ctl_class               = "";
        res.btn_pos_orbit_class             = "";
        res.btn_yaw_class                   = "";

		if (p_andruavUnit.m_isArmed === true) 
		{
            switch (p_andruavUnit.m_VehicleType)
            {
                case js_andruavUnit.VEHICLE_BOAT:
				case js_andruavUnit.VEHICLE_ROVER:
                    res.btn_arm_class                   = " btn-danger ";
                    res.btn_manual_ctl_class            = " btn-primary ";
                    res.btn_yaw_class                   = " disabled hidden ";
		            res.btn_climb_class 	            = " disabled hidden ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " disabled hidden ";
                    res.btn_alt_ctl_class               = " disabled hidden ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " disabled hidden ";
                    res.btn_auto_land_class             = " disabled hidden ";
                    res.btn_auto_hold_class             = " disabled hidden ";
                    res.btn_auto_mission_class          = " btn-primary ";
                    res.btn_auto_rtl_class              = " disabled hidden ";
                    res.btn_auto_vtol_takeoff_class     = " disabled hidden ";
                    res.btn_pos_ctl_class               = " disabled hidden ";
                    res.btn_pos_orbit_class             = " disabled hidden ";
                break;
                    
                case js_andruavUnit.VEHICLE_TRI:
                case js_andruavUnit.VEHICLE_QUAD:
                    res.btn_arm_class                   = " btn-danger ";
                    res.btn_yaw_class                   = " btn-success ";
		            res.btn_climb_class 	            = " btn-warning  ";
                    res.btn_manual_ctl_class            = " btn-danger ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " btn-danger ";
                    res.btn_alt_ctl_class               = " btn-danger ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " btn-warning ";
                    res.btn_auto_land_class             = " btn-warning ";
                    res.btn_auto_hold_class             = " btn-primary ";
                    res.btn_auto_mission_class          = " btn-primary ";
                    res.btn_auto_rtl_class              = " btn-primary ";
                    res.btn_auto_vtol_takeoff_class     = " btn-outline-theme-aware disabled hidden ";
                    res.btn_pos_ctl_class               = " btn-primary ";
                    res.btn_pos_orbit_class             = " btn-primary ";
                break;

                case js_andruavUnit.VEHICLE_SUBMARINE:
                    res.btn_arm_class                   = " btn-danger ";
                    res.btn_yaw_class                   = " btn-success ";
		            res.btn_climb_text                  = "Dive";
			        res.btn_climb_class 	            = " disabled hidden ";
                    res.btn_takeoff_class               = " disabled hidden ";
		            res.btn_manual_ctl_class            = " disabled hidden ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " disabled hidden ";
                    res.btn_alt_ctl_class               = " disabled hidden ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " disabled hidden ";
                    res.btn_auto_land_class             = " disabled hidden ";
                    res.btn_auto_hold_class             = " disabled hidden ";
                    res.btn_auto_mission_class          = " disabled hidden ";
                    res.btn_auto_rtl_class              = " disabled hidden ";
                    res.btn_auto_vtol_takeoff_class     = " disabled hidden ";
                    res.btn_pos_ctl_class               = " disabled hidden ";
                    res.btn_pos_orbit_class             = " disabled hidden ";
                break;
                
                case js_andruavUnit.VEHICLE_VTOL:
                case js_andruavUnit.VEHICLE_PLANE:
                    res.btn_arm_class                   = " btn-danger ";
                    res.btn_yaw_class                   = " disabled hidden ";
		            res.btn_climb_class 	            = " disabled hidden ";
                    res.btn_manual_ctl_class            = " btn-primary ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " btn-danger ";
                    res.btn_alt_ctl_class               = " btn-danger  ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " btn-warning ";
                    res.btn_auto_land_class             = " btn-warning ";
                    res.btn_auto_hold_class             = " btn-primary ";
                    res.btn_auto_mission_class          = " btn-primary ";
                    res.btn_auto_rtl_class              = " btn-primary ";
                    res.btn_auto_vtol_takeoff_class     = " btn-warning ";
                    res.btn_pos_ctl_class               = " btn-primary ";
                    res.btn_pos_orbit_class             = " btn-primary ";
                break; 

                default:
                    res.btn_arm_class                   = " disabled hidden ";
                    res.btn_yaw_class                   = " disabled hidden ";
		            res.btn_climb_class 	            = " disabled hidden ";
                    res.btn_manual_ctl_class            = " disabled hidden ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " disabled hidden ";
                    res.btn_alt_ctl_class               = " disabled hidden ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " disabled hidden ";
                    res.btn_auto_land_class             = " disabled hidden ";
                    res.btn_auto_hold_class             = " disabled hidden ";
                    res.btn_auto_mission_class          = " disabled hidden ";
                    res.btn_auto_rtl_class              = " disabled hidden ";
                    res.btn_auto_vtol_takeoff_class     = " disabled hidden ";
                    res.btn_pos_ctl_class               = " disabled hidden ";
                    res.btn_pos_orbit_class             = " disabled hidden ";
                break;
            }				
							
		}
		else
		{
            // NOT ARMED

			switch (p_andruavUnit.m_VehicleType)
            {
                case js_andruavUnit.VEHICLE_SUBMARINE:
                    res.btn_arm_class 		            = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_yaw_class                   = " btn-outline-theme-aware ";
		            res.btn_climb_class 	            = " btn-outline-theme-aware ";
                    res.btn_climb_text                  = "Dive";
                    res.btn_manual_ctl_class            = " disabled hidden ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " disabled hidden ";
                    res.btn_alt_ctl_class               = " disabled hidden ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " disabled hidden ";
                    res.btn_auto_land_class             = " disabled hidden ";
                    res.btn_auto_hold_class             = " disabled hidden ";
                    res.btn_auto_mission_class          = " disabled hidden ";
                    res.btn_auto_rtl_class              = " disabled hidden ";
                    res.btn_auto_vtol_takeoff_class     = " disabled hidden ";
                    res.btn_pos_ctl_class               = " disabled hidden ";
                    res.btn_pos_orbit_class             = " disabled hidden ";
                    break;

                case js_andruavUnit.VEHICLE_BOAT:
                case js_andruavUnit.VEHICLE_ROVER:
                    res.btn_arm_class 		            = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_yaw_class                   = " disabled hidden  ";
		            res.btn_manual_ctl_class            = " btn-outline-theme-aware ";
                    res.btn_climb_class 	            = " disabled hidden ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " disabled hidden ";
                    res.btn_alt_ctl_class               = " disabled hidden ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " disabled hidden ";
                    res.btn_auto_land_class             = " disabled hidden ";
                    res.btn_auto_hold_class             = " disabled hidden ";
                    res.btn_auto_mission_class          = " btn-outline-theme-aware ";
                    res.btn_auto_rtl_class              = " disabled hidden ";
                    res.btn_auto_vtol_takeoff_class     = " disabled hidden ";
                    res.btn_pos_ctl_class               = " disabled hidden ";
                    res.btn_pos_orbit_class             = " disabled hidden ";
                    break;


                case js_andruavUnit.VEHICLE_TRI:
                case js_andruavUnit.VEHICLE_QUAD:
                    res.btn_arm_class 		            = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_yaw_class                   = " btn-outline-theme-aware ";
		            res.btn_climb_class 	            = " btn-outline-theme-aware ";
                    res.btn_manual_ctl_class            = " btn-outline-theme-aware ";
                    res.btn_acro_ctl_class              = " btn-outline-theme-aware ";
                    res.btn_stabilize_class             = " btn-outline-theme-aware ";
                    res.btn_alt_ctl_class               = " btn-outline-theme-aware ";
                    res.btn_r_attd_class                = " btn-outline-theme-aware ";
                    res.btn_auto_takeoff_class          = " btn-outline-theme-aware ";
                    res.btn_auto_land_class             = " btn-outline-theme-aware ";
                    res.btn_auto_hold_class             = " btn-outline-theme-aware ";
                    res.btn_auto_mission_class          = " btn-outline-theme-aware ";
                    res.btn_auto_rtl_class              = " btn-outline-theme-aware ";
                    res.btn_auto_vtol_takeoff_class     = " disabled hidden ";
                    res.btn_pos_ctl_class               = " btn-outline-theme-aware ";
                    res.btn_pos_orbit_class             = " btn-outline-theme-aware ";
                    break;

                case js_andruavUnit.VEHICLE_VTOL: 
                case js_andruavUnit.VEHICLE_PLANE:
                    res.btn_arm_class 		            = p_andruavUnit.m_is_ready_to_arm===true?" btn-primary ":" btn-light ";
                    res.btn_yaw_class                   = " disabled hidden ";
		            res.btn_climb_class 	            = " btn-outline-theme-aware ";
                    res.btn_manual_ctl_class            = " btn-outline-theme-aware ";
                    res.btn_acro_ctl_class              = " disabled hidden ";
                    res.btn_stabilize_class             = " btn-outline-theme-aware ";
                    res.btn_alt_ctl_class               = " btn-outline-theme-aware ";
                    res.btn_r_attd_class                = " disabled hidden ";
                    res.btn_auto_takeoff_class          = " btn-outline-theme-aware ";
                    res.btn_auto_land_class             = " btn-outline-theme-aware ";
                    res.btn_auto_hold_class             = " btn-outline-theme-aware ";
                    res.btn_auto_mission_class          = " btn-outline-theme-aware ";
                    res.btn_auto_rtl_class              = " btn-outline-theme-aware ";
                    res.btn_auto_vtol_takeoff_class     = " btn-outline-theme-aware ";
                    res.btn_pos_ctl_class               = " btn-outline-theme-aware ";
                    res.btn_pos_orbit_class             = " btn-outline-theme-aware ";
                    break;
        
                default: 
                    break;
            } 				

		}

        return res;
	}

    fn_ToggleArm(v_andruavUnit) { //bug no need to pass parameter
        if (this.fn_canArmDisarm(v_andruavUnit) !== true) return;
        if (this.props.v_andruavUnit !== null && this.props.v_andruavUnit !== undefined) {
            if (this.props.v_andruavUnit.m_isArmed) {
                this.fn_doDisarm(v_andruavUnit);
            }
            else {
                this.fn_doArm(v_andruavUnit);
            }
        }
    }

    fn_doArm(v_andruavUnit) { //bug no need to pass parameter
        if (this.fn_canArmDisarm(v_andruavUnit, 'ARM') !== true) return;
        if (this.props.v_andruavUnit !== null && this.props.v_andruavUnit !== undefined) {
            const sent = js_globals.v_andruavFacade.API_do_Arm(v_andruavUnit, true, false);
            fn_auditAction(sent === true ? 'warn' : 'error', v_andruavUnit?.getPartyID?.() || '', `${sent === true ? 'ARM requested' : 'ARM send failed'} for ${v_andruavUnit?.m_unitName || 'unit'}`);
        }
    }

    fn_doDisarm(v_andruavUnit) {
        if (this.fn_canArmDisarm(v_andruavUnit, 'DISARM') !== true) return;
        if (this.props.v_andruavUnit !== null && this.props.v_andruavUnit !== undefined) {
            const sent = js_globals.v_andruavFacade.API_do_Arm(v_andruavUnit, false, false);
            fn_auditAction(sent === true ? 'warn' : 'error', v_andruavUnit?.getPartyID?.() || '', `${sent === true ? 'DISARM requested' : 'DISARM send failed'} for ${v_andruavUnit?.m_unitName || 'unit'}`);
        }
    }

    fn_canArmDisarm(v_andruavUnit, actionLabel = 'ARM/DISARM') {
        if (js_andruavAuth.fn_canExecuteAction('arm_disarm') === true) return true;
        const role = js_andruavAuth.fn_getRole();
        fn_auditAction(
            'warn',
            v_andruavUnit?.getPartyID?.() || '',
            `[${role}] blocked ${actionLabel} for ${v_andruavUnit?.m_unitName || 'unit'}`
        );
        return false;
    }

    fn_doHold() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_AUTO_HOLD);
    }

    fn_doManual() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_MANUAL);
    }

    fn_doStabilize() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_STABILIZE);
    }

    fn_doAcro() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_ACRO);
    }

    fn_doAltCtl() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_ALT_HOLD);
    }

    fn_doRAttitude() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_RATTITUDE);
    }

    fn_doTakeoff() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_AUTO_TAKEOFF);
    }

    fn_doLand() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_AUTO_LAND);
    }

    fn_doMission() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_AUTO_MISSION);
    }

    fn_doRTL() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_AUTO_RTL);
    }

    fn_doPosCtl() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_POSCTL_POSCTL);
    }

    fn_doPosOrbit() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_POSCTL_ORBIT);
    }

    fn_doVtolTakeOff() {
        js_globals.v_andruavFacade.API_do_FlightMode(this.props.v_andruavUnit, js_andruavUnit.CONST_FLIGHT_PX4_VTOL_TAKEOFF);
    }

    componentDidMount() {
    }

    componentDidUpdate() {
    }

    render ()
    {
        let btn = this.hlp_getflightButtonStyles(this.props.v_andruavUnit);
        const armButtonLabel = this.props.v_andruavUnit.m_isArmed === true ? 'Disarm' : 'Arm';
        const canArmDisarm = js_andruavAuth.fn_canExecuteAction('arm_disarm') === true;
        const role = js_andruavAuth.fn_getRole();
        const armTitle = canArmDisarm === true
            ? `Hold to ${armButtonLabel.toLowerCase()} ${this.props.v_andruavUnit.m_unitName}`
            : `Role ${role} cannot ${armButtonLabel.toLowerCase()} ${this.props.v_andruavUnit.m_unitName}`;
        let ctrl=[];
        

        switch (this.props.v_andruavUnit.m_VehicleType)
        {
            default:
                ctrl.push(<div key={this.props.id+"rc1"}  id={this.props.id+"rc1"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap '>
                    <ClssSafetyHoldButton
                        id='btn_arm'
                        className={'btn btn-sm flgtctrlbtn ' + btn.btn_arm_class}
                        title={armTitle}
                        disabled={canArmDisarm !== true}
                        onConfirm={() => this.fn_ToggleArm(this.props.v_andruavUnit)}
                    >
                        &nbsp;{armButtonLabel}&nbsp;
                    </ClssSafetyHoldButton>
                    <button id='btn_auto_takeoff' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_takeoff_class}  onClick={ () => this.fn_doTakeoff(this.props.v_andruavUnit)}>&nbsp;Takeoff&nbsp;</button>
                    <button id='btn_auto_vtol_takeoff' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_vtol_takeoff_class}  title='VTOL-Takeoff' onClick={ () => this.fn_doVtolTakeOff(this.props.v_andruavUnit)}>&nbsp;V-TkOff&nbsp;</button>
                    <button id='btn_climb' type='button' className={'btn btn-sm  flgtctrlbtn '  + btn.btn_climb_class } onClick={ () => fn_changeAltitude(this.props.v_andruavUnit)}>&nbsp;{btn.btn_climb_text}&nbsp;</button>
                    <button id='btn_manual' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_manual_ctl_class}  title='ARM / DISARM' onClick={ () => this.fn_doManual(this.props.v_andruavUnit)}>&nbsp;Manual&nbsp;</button>
                    <button id='btn_acro_ctl' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_acro_ctl_class}  onClick={ () => this.fn_doAcro(this.props.v_andruavUnit)}>&nbsp;ACRO&nbsp;</button>
                    <button id='btn_stabilize' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_stabilize_class}   onClick={ () => this.fn_doStabilize(this.props.v_andruavUnit)}>&nbsp;Stabilize&nbsp;</button>
                    <button id='btn_alt_ctl' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_alt_ctl_class}  title='Altitude Control' onClick={ () => this.fn_doAltCtl(this.props.v_andruavUnit)}>&nbsp;Alt-CTL&nbsp;</button>
                    <button id='btn_r_attd' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_r_attd_class}  title='R-ATTITUDE' onClick={ () => this.fn_doRAttitude(this.props.v_andruavUnit)}>&nbsp;R-ATT&nbsp;</button>
                    </div></div>);
        
                ctrl.push(<div key={this.props.id+"rc2"}   id={this.props.id+"rc2"}  className= 'col-12  al_l ctrldiv'><div className='btn-group w-100 d-flex flex-wrap '>
                    <button id='btn_auto_land' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_land_class}   onClick={ () => this.fn_doLand(this.props.v_andruavUnit)}>&nbsp;Land&nbsp;</button>
                    <button id='btn_auto_hold' type='button' className={'btn btn-sm  flgtctrlbtn '  + btn.btn_auto_hold_class } onClick={ () => this.fn_doHold(this.props.v_andruavUnit)}>&nbsp;Hold&nbsp;</button>
                    <button id='btn_auto_mission' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_mission_class } onClick={ () => this.fn_doMission(this.props.v_andruavUnit)}>&nbsp;Mission&nbsp;</button>
                    <button id='btn_auto_rtl' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_rtl_class}   onClick={ () => this.fn_doRTL(this.props.v_andruavUnit)}>&nbsp;RTL&nbsp;</button>
                    <button id='btn_auto_vtol_takeoff' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_auto_vtol_takeoff_class}  title='VTOL-Takeoff' onClick={ () => this.fn_doVtolTakeOff(this.props.v_andruavUnit)}>&nbsp;V-TkOff&nbsp;</button>
                    <button id='btn_pos_ctl' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_pos_ctl_class}  title='Position Control' onClick={ () => this.fn_doPosCtl(this.props.v_andruavUnit)}>&nbsp;Pos-Ctl&nbsp;</button>
                    <button id='btn_pos_orbit' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_pos_orbit_class}  title='APosition Orbit' onClick={ () => this.fn_doPosOrbit(this.props.v_andruavUnit)}>&nbsp;Orbit&nbsp;</button>
                    <button id='btn_yaw' type='button' className={'btn btn-sm  flgtctrlbtn ' + btn.btn_yaw_class } onClick={ () => gui_doYAW(this.props.v_andruavUnit.getPartyID())}>&nbsp;YAW&nbsp;</button>
                    </div></div>);
                break;
        }
        

        return (<div key={this.props.id+"rc"}   id={this.props.id+"rc"} >
            {ctrl}
            </div>
        );
    }
}
