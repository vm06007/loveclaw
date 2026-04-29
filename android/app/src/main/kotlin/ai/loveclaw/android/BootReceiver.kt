package ai.loveclaw.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Auto-starts SensorService after device reboot or app update.
 * This means the user cannot stop monitoring by simply rebooting the phone.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED) {

            Prefs.init(context)
            if (Prefs.coupleId.isNotBlank()) {
                Log.i("LoveClaw/Boot", "Auto-starting sensor service after $action")
                SensorService.start(context)
            }
        }
    }
}
