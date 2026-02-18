import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useIssueWizardStore } from '@/store/issueWizardStore';

export default function DescribeStep() {
  const { description, setDescription, category } = useIssueWizardStore();
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-4 py-4">
        <Text className="text-base text-gray-500 mb-1">
          Category: <Text className="font-semibold text-gray-800 capitalize">{category}</Text>
        </Text>
        <Text className="text-base text-gray-700 mb-4">
          Describe the problem in your own words. Include when it started, how severe it is, and any
          prior attempts to get it fixed.
        </Text>

        <TextInput
          className="bg-white border border-gray-300 rounded-xl p-4 text-base text-gray-800 flex-1 min-h-[180px]"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. The radiator in the bedroom has not been working since November. The temperature dropped below 60°F on multiple nights..."
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />
        <Text className="text-right text-xs text-gray-400 mt-1 mb-4">
          {description.length}/2000
        </Text>

        <TouchableOpacity
          className={`rounded-xl py-4 items-center ${description.trim().length < 10 ? 'bg-gray-300' : 'bg-primary-600'}`}
          onPress={() => router.push('/issue/new/photo')}
          disabled={description.trim().length < 10}
        >
          <Text className="text-white font-bold text-base">Continue to Photos</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
