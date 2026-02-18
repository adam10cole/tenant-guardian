import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useIssueWizardStore } from '@/store/issueWizardStore';
import { ISSUE_CATEGORIES } from '@/constants/categories';
import type { IssueCategory } from '@/types/database';

export default function CategoryStep() {
  const { setCategory } = useIssueWizardStore();
  const router = useRouter();

  function handleSelect(category: IssueCategory) {
    setCategory(category);
    router.push('/issue/new/describe');
  }

  return (
    <View className="flex-1 bg-gray-50">
      <Text className="text-base text-gray-500 px-4 py-4">
        What type of housing problem are you reporting?
      </Text>

      <FlatList
        data={ISSUE_CATEGORIES}
        keyExtractor={(item) => item.value}
        numColumns={2}
        columnWrapperClassName="px-4 gap-3"
        ItemSeparatorComponent={() => <View className="h-3" />}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-1 bg-white rounded-xl p-4 shadow-sm items-center"
            onPress={() => handleSelect(item.value)}
          >
            <Text className="text-3xl mb-2">{item.icon}</Text>
            <Text className="text-sm font-semibold text-gray-800 text-center">{item.label}</Text>
            <Text className="text-xs text-gray-500 text-center mt-1">{item.description}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
