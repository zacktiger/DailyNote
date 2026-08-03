import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Two haptics only: `tap` for ordinary acknowledgment, `success` for the one
 * moment that matters (a note becoming a commitment). More than that and the
 * phone starts nagging, which is the failure mode this app is built to avoid.
 */
export const haptics = {
  tap() {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },
  success() {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  },
};
