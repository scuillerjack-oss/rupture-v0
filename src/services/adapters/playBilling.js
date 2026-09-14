// RUPTURE V5.2 — adaptateur Google Play Billing réel (build Android natif
// uniquement), branché sur le plugin Capacitor LOCAL RuptureBillingPlugin
// (android/app/src/main/java/.../RuptureBillingPlugin.java — pas un paquet
// npm : voir ce fichier pour pourquoi aucune dépendance tierce mûre et
// complète n'a été trouvée lors de l'audit de cette passe).
//
// N'est appelé par premium.js QUE lorsque Capacitor.isNativePlatform() est
// vrai ET qu'un vrai productId a été configuré (VITE_PLAY_PRODUCT_ID) - un
// achat réel/sandbox exige de toute façon que ce produit existe déjà dans
// la Play Console pour cet applicationId/signature (voir
// docs/SECRETS_ET_PRODUCTION.md) : rien n'est inventé ici, l'absence de
// productId retombe explicitement sur 'not-connected', jamais sur une
// simulation qui prétendrait avoir réussi.
import { registerPlugin } from '@capacitor/core';

const RuptureBilling = registerPlugin('RuptureBilling');

function getProductId() {
  return typeof import.meta !== 'undefined' ? import.meta.env?.VITE_PLAY_PRODUCT_ID : undefined;
}

export function createNativePlayBillingAdapter() {
  return {
    async purchasePremium() {
      const productId = getProductId();
      if (!productId) {
        return { granted: false, resultKind: 'not-connected', reason: 'VITE_PLAY_PRODUCT_ID non configuré - créez le produit dans la Play Console avant de tester un achat réel/sandbox.' };
      }
      const purchase = await RuptureBilling.purchase({ productId });
      if (!purchase.isAcknowledged) {
        await RuptureBilling.acknowledgePurchase({ purchaseToken: purchase.purchaseToken });
      }
      return { granted: true, resultKind: 'store-verified', purchaseToken: purchase.purchaseToken, orderId: purchase.orderId };
    },

    async restorePurchases() {
      const productId = getProductId();
      if (!productId) {
        return { restored: false, resultKind: 'not-connected', reason: 'VITE_PLAY_PRODUCT_ID non configuré.' };
      }
      const { purchases } = await RuptureBilling.queryActivePurchases();
      const owned = purchases.find((p) => p.productIds.includes(productId));
      if (!owned) return { restored: false, resultKind: 'store-verified' };
      if (!owned.isAcknowledged) {
        await RuptureBilling.acknowledgePurchase({ purchaseToken: owned.purchaseToken });
      }
      return { restored: true, resultKind: 'store-verified', purchaseToken: owned.purchaseToken };
    }
  };
}
