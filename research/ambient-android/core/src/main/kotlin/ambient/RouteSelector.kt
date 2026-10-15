package ambient

enum class Route { BLUETOOTH_LE, BLUETOOTH_SCO, WIRED, PHONE_MIC }

/**
 * Chooses the audio route for capture/playback from the devices currently attached.
 * Preference order: BLE audio, then classic SCO headset, then wired, then the phone.
 * [privacyFallbackToPhone] is false by default: if the user's headset drops we do not
 * silently keep recording on the phone mic; we return null so the service pauses.
 */
fun selectRoute(
    available: Set<Route>,
    lastUsed: Route?,
    privacyFallbackToPhone: Boolean = false,
): Route? {
    val order = listOf(Route.BLUETOOTH_LE, Route.BLUETOOTH_SCO, Route.WIRED)
    for (r in order) if (r in available) return r
    if (lastUsed != null && lastUsed != Route.PHONE_MIC && !privacyFallbackToPhone) return null
    return if (Route.PHONE_MIC in available) Route.PHONE_MIC else null
}
