import $ from 'jquery';
import * as js_siteConfig from '../js_siteConfig'

export function fn_on_ready() {

	$(function () {
		$(document).prop('title', js_siteConfig.CONST_TITLE);
	});
}
