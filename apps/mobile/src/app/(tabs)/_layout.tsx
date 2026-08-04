import { Tabs } from 'expo-router';

import { Icon } from '@/components/icon';
import { useTheme } from '@/theme';

/**
 * Notes, To-dos and the Feed.
 *
 * To-dos is not a second store: a to-do is a note that has been promoted to a
 * commitment, so the tab is a view over the same table rather than a parallel
 * feature with its own data.
 *
 * Feed is last, and that ordering is load-bearing. The app opens on Notes; the
 * social layer is somewhere you go, not somewhere you land. Nothing on the
 * first two tabs links into the third.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.ink,
        tabBarInactiveTintColor: theme.faint,
        tabBarStyle: {
          backgroundColor: theme.canvas,
          borderTopColor: theme.line,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, paddingBottom: 6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color }) => <Icon name="notes" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="todos"
        options={{
          title: 'To-dos',
          tabBarIcon: ({ color }) => <Icon name="todos" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <Icon name="feed" size={21} color={color} />,
        }}
      />
    </Tabs>
  );
}
