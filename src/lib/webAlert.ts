import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * En web, Alert.alert de React Native no hace nada. Este parche lo reemplaza por
 * window.alert / window.confirm para que los avisos y confirmaciones funcionen en Safari.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const actions = buttons.filter((b) => b.style !== 'cancel');
    const chosen = actions[actions.length - 1];
    if (window.confirm(text) && chosen) chosen.onPress?.();
    else buttons.find((b) => b.style === 'cancel')?.onPress?.();
  };
}
