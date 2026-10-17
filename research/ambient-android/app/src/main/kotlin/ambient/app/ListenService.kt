package ambient.app

// UNBUILT: written against the Android API from memory and never compiled or run, because no
// Android SDK was available. Treat it as a sketch for the owner to build in Android Studio.

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.IBinder
import ambient.Chunker
import ambient.EnergyVad
import ambient.Route
import ambient.Segmenter
import ambient.selectRoute

class ListenService : Service() {
    private var worker: Thread? = null
    @Volatile private var running = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("listen", "Listening", NotificationManager.IMPORTANCE_LOW))
        val n = Notification.Builder(this, "listen")
            .setContentTitle("Listening (audio stays on this device)")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now).setOngoing(true).build()
        startForeground(1, n)
        running = true
        worker = Thread { capture() }.also { it.start() }
        return START_NOT_STICKY
    }

    private fun routes(am: AudioManager): Pair<Set<Route>, AudioDeviceInfo?> {
        val devs = am.getDevices(AudioManager.GET_DEVICES_INPUTS)
        val map = devs.mapNotNull {
            when (it.type) {
                AudioDeviceInfo.TYPE_BLE_HEADSET -> Route.BLUETOOTH_LE to it
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> Route.BLUETOOTH_SCO to it
                AudioDeviceInfo.TYPE_WIRED_HEADSET -> Route.WIRED to it
                AudioDeviceInfo.TYPE_BUILTIN_MIC -> Route.PHONE_MIC to it
                else -> null
            }
        }
        return map.map { it.first }.toSet() to map.firstOrNull()?.second
    }

    private fun capture() {
        val am = getSystemService(AudioManager::class.java)
        val rate = 16000
        val frame = rate * 30 / 1000
        val minBuf = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        @Suppress("MissingPermission")
        val rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuf, frame * 4))
        val route = selectRoute(routes(am).first, lastUsed = null)
        if (route == null) { stopSelf(); return }          // no acceptable mic: do not record
        val chunker = Chunker(frame)
        val seg = Segmenter(EnergyVad(rmsThreshold = 500.0, hangoverFrames = 10), preRoll = 5, maxFrames = 1000) {
            // TODO(owner): hand `it` to the on-device recogniser (whisper.cpp via JNI). Not written.
        }
        rec.startRecording()
        val buf = ShortArray(frame)
        while (running) {
            val n = rec.read(buf, 0, buf.size)
            if (n > 0) chunker.push(buf.copyOf(n)) { seg.push(it) }
        }
        seg.close(); rec.stop(); rec.release()
    }

    override fun onDestroy() { running = false; super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null
}
