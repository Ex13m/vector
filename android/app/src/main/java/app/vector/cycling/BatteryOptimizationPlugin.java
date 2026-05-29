package app.vector.cycling;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Запрос исключения из Doze / battery optimization.
 *
 * Без этого Android агрессивно усыпляет процесс при выключенном экране,
 * замораживая даже foreground-сервис GPS на 5+ минут (наблюдалось в
 * диагностике: dt=316s — голос и трек полностью замирали). Когда приложение
 * в белом списке оптимизации батареи, Doze его не трогает.
 */
@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    /** Уже ли приложение исключено из оптимизации батареи. */
    @PluginMethod
    public void isIgnoring(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ignoring", isIgnoringOptimizations());
        call.resolve(ret);
    }

    /**
     * Показывает системный диалог запроса исключения. Если уже исключено —
     * ничего не делает. Возвращает текущее состояние (до показа диалога:
     * результат диалога асинхронный, перепроверяется отдельным isIgnoring()).
     */
    @PluginMethod
    public void request(PluginCall call) {
        Context ctx = getContext();
        boolean ignoring = isIgnoringOptimizations();
        if (!ignoring) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + ctx.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            } catch (Exception e) {
                // На некоторых прошивках прямой запрос недоступен — открываем
                // общий экран настроек оптимизации батареи как запасной путь.
                try {
                    Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(fallback);
                } catch (Exception ignored) {
                    // ничего не делаем — вернём текущее (false) состояние
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoring);
        call.resolve(ret);
    }

    private boolean isIgnoringOptimizations() {
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm == null) return true; // не можем проверить — не блокируем поток
        return pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }
}
