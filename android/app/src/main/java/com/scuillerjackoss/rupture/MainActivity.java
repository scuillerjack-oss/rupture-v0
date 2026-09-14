package com.scuillerjackoss.rupture;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // RUPTURE V5.2 : plugin local Play Billing (voir RuptureBillingPlugin) -
        // doit être enregistré avant super.onCreate() (convention Capacitor).
        registerPlugin(RuptureBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
