import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { upcomingAlerts } from './alerts';

const KEY = 'alerts-enabled';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function loadEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === '1';
}

/** Cancel everything and schedule the next 7 days of heads-up alerts (OS caps pending local notifications, so we send at most 60). */
export async function scheduleAlerts(): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const list = upcomingAlerts(Date.now(), 7, 5, 60);
  for (const a of list) {
    await Notifications.scheduleNotificationAsync({
      content: { title: a.title, body: a.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(a.at) },
    });
  }
  return list.length;
}

export async function setEnabled(on: boolean): Promise<boolean> {
  if (!on) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.setItem(KEY, '0');
    return false;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('zones', { name: 'Zone alerts', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;
  await scheduleAlerts();
  await AsyncStorage.setItem(KEY, '1');
  return true;
}
