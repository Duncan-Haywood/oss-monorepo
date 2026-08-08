using Toybox.Application as App;
using Toybox.WatchUi as Ui;

class WorldTravelerApp extends App.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
    }

    function onStop(state) {
    }

    function getInitialView() {
        return [ new WorldTravelerView() ];
    }

    // Settings are edited on the phone/Garmin Express while the face is
    // running on the watch; the system calls this so we can redraw with the
    // new city selections/theme immediately instead of waiting a minute.
    function onSettingsChanged() {
        Ui.requestUpdate();
    }

}
