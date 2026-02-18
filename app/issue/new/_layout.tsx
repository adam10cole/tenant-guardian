import { Stack } from 'expo-router';

export default function NewIssueLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Back' }}>
      <Stack.Screen name="category" options={{ title: 'Step 1 of 4: Category' }} />
      <Stack.Screen name="describe" options={{ title: 'Step 2 of 4: Describe' }} />
      <Stack.Screen name="photo" options={{ title: 'Step 3 of 4: Photos' }} />
      <Stack.Screen name="confirm" options={{ title: 'Step 4 of 4: Review' }} />
    </Stack>
  );
}
