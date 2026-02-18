import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const router = useRouter();

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setSession(data.session);
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      Alert.alert('Login failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-bold text-primary-600 mb-2">Tenant Guardian</Text>
        <Text className="text-base text-gray-500 mb-10">Housing advocacy in your pocket.</Text>

        <Text className="text-sm font-semibold text-gray-700 mb-1">Email</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
        />

        <Text className="text-sm font-semibold text-gray-700 mb-1">Password</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-6"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          textContentType="password"
        />

        <TouchableOpacity
          className={`rounded-lg py-4 items-center ${loading ? 'bg-primary-300' : 'bg-primary-600'}`}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <Link href="/(auth)/register" asChild>
          <TouchableOpacity className="mt-6 items-center">
            <Text className="text-primary-600 text-base">
              Don&apos;t have an account? <Text className="font-bold">Register</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
