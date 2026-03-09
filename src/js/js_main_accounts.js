import $ from 'jquery';
import 'jquery-ui-dist/jquery-ui.min.js';

import * as js_siteConfig from './js_siteConfig'


export function fn_on_account_ready() {
    $(function () {
        $(document).prop('title', js_siteConfig.CONST_TITLE);
    });
}
