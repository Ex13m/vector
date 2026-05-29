package app.vector.cycling;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Локальный плагин: исключение из Doze / battery optimization,
        // чтобы фоновый GPS-сервис не замораживался при выключенном экране.
        registerPlugin(BatteryOptimizationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
