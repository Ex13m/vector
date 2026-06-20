package cz.konsalting.vektor;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
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
        resolveIgnoring(call);
    }

    /**
     * Показывает системный диалог запроса исключения и резолвится ПОСЛЕ его
     * закрытия актуальным состоянием — через startActivityForResult +
     * @ActivityCallback.
     *
     * Раньше резолвили синхронно состоянием ДО диалога (всегда false), а
     * перепроверка висела на visibilitychange в JS. Системный диалог Doze —
     * полупрозрачный оверлей, и visibilitychange для него срабатывает не
     * всегда → баннер не пропадал, приходилось жать «Разрешить» второй раз.
     */
    @PluginMethod
    public void request(PluginCall call) {
        if (isIgnoringOptimizations()) {
            resolveIgnoring(call);
            return;
        }
        Context ctx = getContext();
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            // Без FLAG_ACTIVITY_NEW_TASK: для доставки результата диалог должен
            // запускаться в нашей задаче (иначе @ActivityCallback не вызовется).
            startActivityForResult(call, intent, "onBatteryResult");
        } catch (Exception e) {
            // На некоторых прошивках прямой запрос недоступен — открываем общий
            // экран настроек оптимизации батареи как запасной путь.
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                startActivityForResult(call, fallback, "onBatteryResult");
            } catch (Exception ignored) {
                resolveIgnoring(call); // вернём текущее состояние
            }
        }
    }

    /**
     * Колбэк после закрытия системного диалога. Код результата не используем
     * (диалог Doze его не выставляет) — перечитываем реальный статус у
     * PowerManager, чтобы JS получил актуальное значение и скрыл баннер.
     */
    @ActivityCallback
    private void onBatteryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        resolveIgnoring(call);
    }

    private void resolveIgnoring(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ignoring", isIgnoringOptimizations());
        call.resolve(ret);
    }

    private boolean isIgnoringOptimizations() {
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm == null) return true; // не можем проверить — не блокируем поток
        return pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }
}
