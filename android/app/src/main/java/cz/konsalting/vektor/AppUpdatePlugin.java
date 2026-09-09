package cz.konsalting.vektor;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Обновление приложения из Google Play, не выходя в маркет (In-App Updates).
 *
 * Режим ТОЛЬКО мягкий (FLEXIBLE): Play скачивает обновление в фоне, человек
 * продолжает ехать, и лишь когда файл готов — снизу появляется полоска
 * «Перезапустить». Жёсткий режим (IMMEDIATE) сознательно не реализован:
 * он показывает полноэкранный прогресс и не пускает в приложение, а наш
 * человек в этот момент может стоять на перекрёстке и хотеть поехать.
 *
 * Почему это вообще нужно, если Play обновляет сам: автообновление приходит
 * когда придёт (Wi-Fi, зарядка, окно обслуживания), и версия на телефоне
 * может неделями отставать от свежей. Здесь же проверка происходит при
 * каждом запуске.
 *
 * Ограничения, о которых надо помнить при проверке:
 *   • работает только для версий, опубликованных в Play, и только если
 *     установка пришла оттуда же — на внутреннем тесте не сработает;
 *   • Play сам решает, показывать ли диалог: если человек недавно отказался,
 *     повторно спрашивать не станет.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final int REQ_UPDATE = 4711;

    private AppUpdateManager manager;
    /** Последний ответ Play — нужен, чтобы start() не запрашивал его заново. */
    private AppUpdateInfo pending;
    private boolean downloaded;

    private final InstallStateUpdatedListener installListener = state -> {
        if (state.installStatus() == InstallStatus.DOWNLOADED) {
            downloaded = true;
            notifyListeners("updateDownloaded", new JSObject().put("ready", true));
        }
    };

    @Override
    public void load() {
        manager = AppUpdateManagerFactory.create(getContext());
        manager.registerListener(installListener);
    }

    @Override
    protected void handleOnDestroy() {
        if (manager != null) manager.unregisterListener(installListener);
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Обновление могло докачаться, пока приложение было свёрнуто: тогда
        // события мы не увидим, а предложить перезапуск всё равно надо.
        if (manager == null || downloaded) return;
        manager.getAppUpdateInfo().addOnSuccessListener(info -> {
            if (info.installStatus() == InstallStatus.DOWNLOADED) {
                downloaded = true;
                notifyListeners("updateDownloaded", new JSObject().put("ready", true));
            }
        });
    }

    /** Есть ли обновление. Ошибку не считаем бедой: нет Play — нет проверки. */
    @PluginMethod
    public void check(PluginCall call) {
        if (manager == null) {
            call.resolve(new JSObject().put("available", false).put("downloaded", false));
            return;
        }
        manager.getAppUpdateInfo()
                .addOnSuccessListener(info -> {
                    pending = info;
                    boolean ready = info.installStatus() == InstallStatus.DOWNLOADED;
                    downloaded = downloaded || ready;
                    boolean available =
                            info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                                    && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE);
                    call.resolve(new JSObject()
                            .put("available", available)
                            .put("downloaded", downloaded));
                })
                .addOnFailureListener(e -> call.resolve(new JSObject()
                        .put("available", false)
                        .put("downloaded", false)
                        .put("reason", String.valueOf(e.getMessage()))));
    }

    /** Показать диалог согласия и начать фоновую загрузку. */
    @PluginMethod
    public void start(PluginCall call) {
        Activity activity = getActivity();
        if (manager == null || pending == null || activity == null) {
            call.resolve(new JSObject().put("started", false));
            return;
        }
        if (pending.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE
                || !pending.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
            call.resolve(new JSObject().put("started", false));
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                manager.startUpdateFlowForResult(
                        pending,
                        activity,
                        AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
                        REQ_UPDATE);
                call.resolve(new JSObject().put("started", true));
            } catch (Exception e) {
                call.resolve(new JSObject()
                        .put("started", false)
                        .put("reason", String.valueOf(e.getMessage())));
            }
        });
    }

    /** Установить скачанное и перезапустить приложение. */
    @PluginMethod
    public void complete(PluginCall call) {
        if (manager == null || !downloaded) {
            call.resolve(new JSObject().put("completed", false));
            return;
        }
        manager.completeUpdate();
        call.resolve(new JSObject().put("completed", true));
    }
}
