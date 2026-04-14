import { useState } from 'react';
import type { UserRole } from '@/types/database';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getSupportedJurisdictions } from '@/lib/deadlines';

const JURISDICTIONS = getSupportedJurisdictions();

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [jurisdiction, setJurisdiction] = useState('MI-ANN-ARBOR');
  const [role, setRole] = useState<UserRole>('tenant');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRegister() {
    if (!email || !password || !displayName) {
      Alert.alert('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      // Pass profile fields as user metadata so the DB trigger can set them
      // immediately — before email confirmation grants a session.
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            role,
            jurisdiction: role === 'tenant' ? jurisdiction : 'MI-GENERAL',
          },
        },
      });
      if (error) throw error;

      Alert.alert(
        'Check your email',
        'We sent a confirmation link. Click it to activate your account.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
      );
    } catch (error) {
      Alert.alert('Registration failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView className="flex-1" contentContainerClassName="px-6 py-10">
        <Text className="text-3xl font-bold text-primary-600 mb-2">Create Account</Text>
        <Text className="text-base text-gray-500 mb-8">Your data stays yours.</Text>

        <Text className="text-sm font-semibold text-gray-700 mb-2">I am a...</Text>
        <View className="flex-row gap-3 mb-6">
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg border items-center ${role === 'tenant' ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'}`}
            onPress={() => setRole('tenant')}
          >
            <Text
              className={`font-semibold text-sm ${role === 'tenant' ? 'text-white' : 'text-gray-700'}`}
            >
              Tenant
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg border items-center ${role === 'landlord' ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'}`}
            onPress={() => setRole('landlord')}
          >
            <Text
              className={`font-semibold text-sm ${role === 'landlord' ? 'text-white' : 'text-gray-700'}`}
            >
              Property Manager
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-sm font-semibold text-gray-700 mb-1">Full Name</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Jane Smith"
          textContentType="name"
          autoComplete="name"
        />

        <Text className="text-sm font-semibold text-gray-700 mb-1">Email</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Text className="text-sm font-semibold text-gray-700 mb-1">Password</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          textContentType="newPassword"
        />

        {role === 'tenant' && (
          <>
            <Text className="text-sm font-semibold text-gray-700 mb-1">City / Jurisdiction</Text>
            <View className="border border-gray-300 rounded-lg mb-6 overflow-hidden">
              {JURISDICTIONS.map((j) => (
                <TouchableOpacity
                  key={j}
                  className={`px-4 py-3 ${jurisdiction === j ? 'bg-primary-100' : 'bg-white'}`}
                  onPress={() => setJurisdiction(j)}
                >
                  <Text
                    className={`text-base ${jurisdiction === j ? 'text-primary-700 font-semibold' : 'text-gray-700'}`}
                  >
                    {j.replace('MI-', '').replace(/-/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity
          className={`rounded-lg py-4 items-center ${loading ? 'bg-primary-300' : 'bg-primary-600'}`}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Creating account...' : 'Create Account'}
          </Text>
        </TouchableOpacity>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity className="mt-6 items-center">
            <Text className="text-primary-600 text-base">
              Already have an account? <Text className="font-bold">Sign In</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
