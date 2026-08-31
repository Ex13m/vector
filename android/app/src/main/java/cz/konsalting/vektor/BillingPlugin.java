package cz.konsalting.vektor;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

/**
 * Покупка полной версии — один разовый товар (non-consumable) через Google Play Billing.
 *
 * Сервера у приложения нет, поэтому единственный источник правды о владении —
 * queryPurchasesAsync: данные приходят из Play Store, а не из нашего кода. Это же
 * и есть restore при переустановке и на новом устройстве.
 *
 * Важные правила, нарушение которых стоит денег пользователю:
 *   • handlePurchase вызывается из ОБОИХ источников — и из onPurchasesUpdated,
 *     и из queryPurchasesAsync. Покупка, совершённая на другом устройстве или
 *     дозревшая при закрытом приложении, иначе не будет подтверждена — и Google
 *     вернёт за неё деньги через трое суток, отобрав доступ у заплатившего.
 *   • В состоянии PENDING не выдаём доступ и не подтверждаем: оплата ещё не прошла.
 *   • consumeAsync НЕ вызываем никогда — товар неисчерпаемый.
 *   • Доступ снимаем только по УСПЕШНОМУ пустому ответу query. Ошибка запроса
 *     (нет сети) прежнее состояние не трогает: велосипедист посреди маршрута
 *     без связи не должен лишиться навигации.
 */
@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin implements PurchasesUpdatedListener, BillingClientStateListener {

    private BillingClient client;
    private boolean connected = false;

    // ── жизненный цикл ────────────────────────────────────────────────────

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
                .setListener(this)
                // Параметрless enablePendingPurchases() удалён в Billing 8/9 —
                // тип отложенных покупок теперь указывается явно.
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Покупка могла дозреть или быть возвращена, пока приложение было свёрнуто.
        // RTDN нам недоступны (нет сервера), поэтому перечитываем при каждом возврате.
        if (connected) queryOwnership("query");
    }

    // ── подключение ───────────────────────────────────────────────────────

    @PluginMethod
    public void init(PluginCall call) {
        if (connected) {
            queryOwnership("query");
            call.resolve(new JSObject().put("available", true));
            return;
        }
        pendingInit = call;
        client.startConnection(this);
    }

    private PluginCall pendingInit;

    @Override
    public void onBillingSetupFinished(@NonNull BillingResult result) {
        connected = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
        if (connected) queryOwnership("query");
        if (pendingInit != null) {
            JSObject ret = new JSObject().put("available", connected);
            if (!connected) ret.put("reason", result.getDebugMessage());
            pendingInit.resolve(ret);
            pendingInit = null;
        }
    }

    @Override
    public void onBillingServiceDisconnected() {
        connected = false; // enableAutoServiceReconnection переподключит сам
    }

    // ── цена товара ───────────────────────────────────────────────────────

    /**
     * Цену берём из Play, а не из констант в коде: она зависит от страны, валюты
     * и налогов, и захардкоженная строка рано или поздно соврёт пользователю.
     */
    @PluginMethod
    public void getProduct(PluginCall call) {
        String id = call.getString("productId");
        if (id == null) { call.reject("productId не задан"); return; }
        if (!connected) { call.reject("Google Play недоступен"); return; }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(id)
                                .setProductType(BillingClient.ProductType.INAPP)
                                .build()))
                .build();

        client.queryProductDetailsAsync(params, (BillingResult res, QueryProductDetailsResult out) -> {
            if (res.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("Play вернул ошибку: " + res.getDebugMessage());
                return;
            }
            List<ProductDetails> list = out.getProductDetailsList();
            if (list == null || list.isEmpty()) {
                call.reject("Товар " + id + " не найден в Play Console");
                return;
            }
            ProductDetails d = list.get(0);
            ProductDetails.OneTimePurchaseOfferDetails offer = d.getOneTimePurchaseOfferDetails();
            if (offer == null) { call.reject("У товара нет разовой цены"); return; }
            call.resolve(new JSObject()
                    .put("productId", d.getProductId())
                    .put("formattedPrice", offer.getFormattedPrice())
                    .put("priceMicros", offer.getPriceAmountMicros())
                    .put("currency", offer.getPriceCurrencyCode()));
        });
    }

    // ── покупка ───────────────────────────────────────────────────────────

    /**
     * Резолвится сразу после открытия окна Play. Исход приходит отдельно
     * событием entitlementChanged — так устроен PurchasesUpdatedListener, и
     * держать PluginCall до конца оплаты было бы хрупко.
     */
    @PluginMethod
    public void purchase(PluginCall call) {
        String id = call.getString("productId");
        if (id == null) { call.reject("productId не задан"); return; }
        if (!connected) { call.reject("Google Play недоступен"); return; }
        Activity activity = getActivity();
        if (activity == null) { call.reject("Нет активности для окна оплаты"); return; }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(id)
                                .setProductType(BillingClient.ProductType.INAPP)
                                .build()))
                .build();

        client.queryProductDetailsAsync(params, (BillingResult res, QueryProductDetailsResult out) -> {
            List<ProductDetails> list = out.getProductDetailsList();
            if (res.getResponseCode() != BillingClient.BillingResponseCode.OK || list == null || list.isEmpty()) {
                call.reject("Товар недоступен: " + res.getDebugMessage());
                return;
            }
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(list.get(0))
                                    .build()))
                    .build();
            // launchBillingFlow обязан вызываться в главном потоке.
            activity.runOnUiThread(() -> {
                BillingResult launch = client.launchBillingFlow(activity, flow);
                if (launch.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                    // Переустановка или второе устройство: это не ошибка, а restore.
                    queryOwnership("query");
                    call.resolve();
                    return;
                }
                if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    emitError(launch);
                }
                call.resolve();
            });
        });
    }

    // ── восстановление ────────────────────────────────────────────────────

    @PluginMethod
    public void restore(PluginCall call) {
        if (!connected) { call.reject("Google Play недоступен"); return; }
        client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP).build(),
                (BillingResult res, List<Purchase> purchases) -> {
                    if (res.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("Не удалось проверить покупки: " + res.getDebugMessage());
                        return;
                    }
                    Ownership own = applyPurchases(purchases, "query");
                    call.resolve(new JSObject()
                            .put("owned", own.owned)
                            .put("pending", own.pending));
                });
    }

    // ── общая обработка ───────────────────────────────────────────────────

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            applyPurchases(purchases, "purchase");
            return;
        }
        if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            queryOwnership("query");
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.USER_CANCELED) {
            emitError(result);
        }
    }

    private void queryOwnership(String source) {
        client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP).build(),
                (BillingResult res, List<Purchase> purchases) -> {
                    // Ошибка запроса (нет сети) прежнее состояние не меняет —
                    // снимать доступ можно только по успешному пустому ответу.
                    if (res.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
                    applyPurchases(purchases, source);
                });
    }

    private static class Ownership {
        boolean owned;
        boolean pending;
    }

    private Ownership applyPurchases(List<Purchase> purchases, String source) {
        Ownership own = new Ownership();
        if (purchases != null) {
            for (Purchase p : purchases) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    own.owned = true;
                    if (!p.isAcknowledged()) {
                        client.acknowledgePurchase(
                                AcknowledgePurchaseParams.newBuilder()
                                        .setPurchaseToken(p.getPurchaseToken()).build(),
                                r -> { /* повторное подтверждение безвредно */ });
                    }
                } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    // Оплата ещё не прошла: ни доступа, ни подтверждения.
                    own.pending = true;
                }
            }
        }
        JSObject ev = new JSObject()
                .put("owned", own.owned)
                .put("pending", own.pending)
                .put("source", source);
        notifyListeners("entitlementChanged", ev);
        return own;
    }

    private void emitError(BillingResult result) {
        notifyListeners("billingError", new JSObject()
                .put("code", result.getResponseCode())
                .put("message", result.getDebugMessage()));
    }
}
