package com.scuillerjackoss.rupture;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

// RUPTURE V5.2 — plugin Capacitor local (pas un paquet npm distribué) pour
// Google Play Billing, écrit spécifiquement pour cette passe.
//
// Pourquoi un plugin local plutôt qu'une dépendance tierce : l'audit de
// cette passe a inspecté le seul plugin Capacitor Play Billing librement
// disponible et à jour trouvé (`capacitor-billing`, un seul mainteneur) et
// y a trouvé deux lacunes réelles disqualifiantes pour ce cahier des
// charges : aucune méthode de restauration des achats existants
// (`queryPurchasesAsync` jamais appelé), et une méthode `finishTransaction`
// déclarée côté JS mais jamais implémentée côté natif (aurait échoué à
// l'exécution). Plutôt que de brancher un composant connu incomplet ou d'en
// fabriquer un neuf en prétendant qu'il est mûr, ce plugin est volontairement
// petit et local : 4 méthodes, un seul produit non consommable (Premium),
// jamais de logique métier au-delà de Play Billing lui-même (voir
// src/services/premium.js pour la logique produit).
//
// Portée assumée : Premium est un achat UNIQUE non consommable (pas un
// abonnement, pas de contenu consommable) - voir
// docs/RUPTURE_Audit_Economique_Precommercialisation.pdf. queryPurchases()
// sert à la fois de restauration explicite ET de vérification silencieuse
// au démarrage (même appel, la logique de fréquence appartient au JS).
@CapacitorPlugin(name = "RuptureBilling")
public class RuptureBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private boolean isReady = false;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases()
                .build();
        connect(null);
    }

    private void connect(Runnable onReady) {
        if (isReady) {
            if (onReady != null) onReady.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                isReady = billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK;
                if (isReady && onReady != null) onReady.run();
            }

            @Override
            public void onBillingServiceDisconnected() {
                isReady = false;
            }
        });
    }

    private void rejectNotReady(PluginCall call, BillingResult billingResult) {
        call.reject("Play Billing indisponible (code " + billingResult.getResponseCode() + "): "
                + billingResult.getDebugMessage()
                + ". Vérifiez que l'app est installée via le Play Store (piste de test incluse) "
                + "et que le produit existe dans la Play Console pour ce applicationId signé.");
    }

    // Détails d'un produit non consommable (prix formaté localement par
    // Play, titre, description) - échoue explicitement si le produit
    // n'existe pas encore côté Play Console plutôt que d'inventer une
    // réponse (voir en-tête).
    @PluginMethod
    public void getProductDetails(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId requis");
            return;
        }
        connect(() -> {
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                    .setProductList(Collections.singletonList(
                            QueryProductDetailsParams.Product.newBuilder()
                                    .setProductId(productId)
                                    .setProductType(BillingClient.ProductType.INAPP)
                                    .build()))
                    .build();
            billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rejectNotReady(call, billingResult);
                    return;
                }
                if (productDetailsList == null || productDetailsList.isEmpty()) {
                    call.reject("Produit \"" + productId + "\" introuvable dans la Play Console pour cet applicationId/signature.");
                    return;
                }
                ProductDetails details = productDetailsList.get(0);
                JSObject ret = new JSObject();
                ret.put("productId", details.getProductId());
                ret.put("title", details.getName());
                ret.put("description", details.getDescription());
                ProductDetails.OneTimePurchaseOfferDetails offer = details.getOneTimePurchaseOfferDetails();
                if (offer != null) {
                    ret.put("formattedPrice", offer.getFormattedPrice());
                    ret.put("priceAmountMicros", offer.getPriceAmountMicros());
                    ret.put("priceCurrencyCode", offer.getPriceCurrencyCode());
                }
                call.resolve(ret);
            });
        });
    }

    // Lance le flux d'achat réel Play (ou un achat de TEST sans frais réel
    // si le compte connecté est un "license tester" de la fiche Play
    // Console - voir le rapport technique). Le résultat arrive de manière
    // asynchrone via onPurchasesUpdated ci-dessous ; cette méthode ne
    // résout donc PAS directement l'achat, elle ne fait que déclencher
    // l'UI Play.
    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId requis");
            return;
        }
        call.setKeepAlive(true);
        pendingPurchaseCall = call;
        connect(() -> {
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                    .setProductList(Collections.singletonList(
                            QueryProductDetailsParams.Product.newBuilder()
                                    .setProductId(productId)
                                    .setProductType(BillingClient.ProductType.INAPP)
                                    .build()))
                    .build();
            billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                        || productDetailsList == null || productDetailsList.isEmpty()) {
                    pendingPurchaseCall = null;
                    rejectNotReady(call, billingResult);
                    return;
                }
                BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(Collections.singletonList(
                                BillingFlowParams.ProductDetailsParams.newBuilder()
                                        .setProductDetails(productDetailsList.get(0))
                                        .build()))
                        .build();
                BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowParams);
                if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    pendingPurchaseCall = null;
                    rejectNotReady(call, launchResult);
                }
            });
        });
    }

    private PluginCall pendingPurchaseCall;

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (call == null) return; // achat déclenché ailleurs (ne devrait pas arriver, un seul produit)

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("Achat annulé par l'utilisateur", "USER_CANCELED");
            return;
        }
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject("Échec de l'achat (code " + billingResult.getResponseCode() + "): " + billingResult.getDebugMessage());
            return;
        }
        Purchase purchase = purchases.get(0);
        call.resolve(purchaseToJs(purchase));
    }

    // Restauration ET vérification silencieuse (même appel, voir en-tête) :
    // renvoie tous les achats non consommables actifs (PURCHASED) pour ce
    // compte Google connecté sur cet appareil - Play, pas ce plugin, est la
    // seule source de vérité.
    @PluginMethod
    public void queryActivePurchases(PluginCall call) {
        connect(() -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build();
            billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rejectNotReady(call, billingResult);
                    return;
                }
                JSArray active = new JSArray();
                for (Purchase purchase : purchases) {
                    if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                        active.put(purchaseToJs(purchase));
                    }
                }
                JSObject ret = new JSObject();
                ret.put("purchases", active);
                call.resolve(ret);
            });
        });
    }

    // À appeler après avoir accordé l'entitlement Premium côté jeu : Play
    // annule automatiquement un achat non consommable non acquitté sous 3
    // jours - jamais consommé (voir en-tête, permanent par design).
    @PluginMethod
    public void acknowledgePurchase(PluginCall call) {
        String purchaseToken = call.getString("purchaseToken");
        if (purchaseToken == null) {
            call.reject("purchaseToken requis");
            return;
        }
        connect(() -> {
            AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchaseToken)
                    .build();
            billingClient.acknowledgePurchase(params, billingResult -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rejectNotReady(call, billingResult);
                    return;
                }
                call.resolve();
            });
        });
    }

    private JSObject purchaseToJs(Purchase purchase) {
        JSObject obj = new JSObject();
        obj.put("purchaseToken", purchase.getPurchaseToken());
        obj.put("orderId", purchase.getOrderId());
        obj.put("productIds", new JSArray(purchase.getProducts()));
        obj.put("isAcknowledged", purchase.isAcknowledged());
        obj.put("purchaseState", purchase.getPurchaseState());
        obj.put("purchaseTime", purchase.getPurchaseTime());
        return obj;
    }
}
