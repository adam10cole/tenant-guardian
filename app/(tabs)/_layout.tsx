import { Tabs } from 'expo-router';
import { View } from 'react-native';

function TabBarIcon({ symbol: _symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <View className="items-center justify-center">
      <View className={`w-6 h-6 rounded ${focused ? 'bg-primary-600' : 'bg-gray-400'}`} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1a56db',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { paddingBottom: 4 },
        headerStyle: { backgroundColor: '#1a56db' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'My Issues',
          tabBarLabel: 'Issues',
          tabBarIcon: ({ focused }) => <TabBarIcon symbol="list" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="heatmap"
        options={{
          title: 'Heatmap',
          tabBarIcon: ({ focused }) => <TabBarIcon symbol="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabBarIcon symbol="person" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
