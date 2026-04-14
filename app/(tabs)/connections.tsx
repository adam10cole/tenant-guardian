import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/store/profileStore';
import { useLinkedUsers, useRevokeLink } from '@/hooks/useLinkedUsers';
import type { PendingInvitation } from '@/types/database';

function usePendingInvitations() {
  return useQuery({
    queryKey: ['pending-invitations-for-me'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_pending_invitations_for_me');
      if (error) throw error;
      return (data ?? []) as PendingInvitation[];
    },
    staleTime: 0, // Always refetch — invitations are real-time
  });
}

export default function ConnectionsScreen() {
  const role = useRole();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const {
    data: linkedUsers = [],
    isLoading: linksLoading,
    refetch: refetchLinks,
  } = useLinkedUsers();

  const {
    data: pendingForMe = [],
    isLoading: pendingLoading,
    error: pendingError,
    refetch: refetchPending,
  } = usePendingInvitations();

  const revokeMutation = useRevokeLink();

  useFocusEffect(
    useCallback(() => {
      refetchPending();
    }, [refetchPending]),
  );

  function invalidateConnections() {
    queryClient.invalidateQueries({ queryKey: ['connections'] });
    queryClient.invalidateQueries({ queryKey: ['landlord-issues'] });
    refetchPending();
    refetchLinks();
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      Alert.alert('Email required', 'Please enter an email address.');
      return;
    }
    setInviting(true);
    try {
      const { error } = await supabase.rpc('send_in_app_invitation', {
        p_email: inviteEmail.trim(),
      });
      if (error) throw new Error(error.message);
      setInviteEmail('');
      Alert.alert('Request sent', `A connection request was sent to ${inviteEmail.trim()}.`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setInviting(false);
    }
  }

  async function handleAccept(invitation: PendingInvitation) {
    setActionId(invitation.id + '-accept');
    try {
      const { error } = await supabase.rpc('accept_invitation', { p_token: invitation.token });
      if (error) throw new Error(error.message);
      invalidateConnections();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not accept request');
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(invitation: PendingInvitation) {
    setActionId(invitation.id + '-reject');
    try {
      const { error } = await supabase.rpc('reject_invitation', { p_token: invitation.token });
      if (error) throw new Error(error.message);
      refetchPending();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not decline request');
    } finally {
      setActionId(null);
    }
  }

  function handleRevoke(linkId: string, name: string | null) {
    Alert.alert('Remove Connection', `Remove ${name ?? 'this user'} from your connections?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => revokeMutation.mutate(linkId),
      },
    ]);
  }

  const isLoading = linksLoading || pendingLoading;

  return (
    <FlatList
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => {
            refetchLinks();
            refetchPending();
          }}
          tintColor="#1a56db"
        />
      }
      data={[]}
      renderItem={null}
      ListHeaderComponent={
        <View>
          {/* Debug: pending query error */}
          {pendingError && (
            <View className="bg-danger-50 border border-danger-200 rounded-xl p-3 mb-4">
              <Text className="text-danger-700 text-xs font-semibold">Pending query error:</Text>
              <Text className="text-danger-600 text-xs">
                {(pendingError as Error)?.message ?? String(pendingError)}
              </Text>
            </View>
          )}

          {/* Incoming connection requests */}
          {pendingForMe.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Connection Requests
              </Text>
              {pendingForMe.map((inv) => (
                <View
                  key={inv.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm"
                >
                  <Text className="text-sm font-semibold text-gray-800 mb-0.5">
                    {inv.inviter_name ?? 'Someone'}
                  </Text>
                  <Text className="text-xs text-gray-500 mb-3">
                    Wants to connect with you as your {inv.role_to_give}
                  </Text>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1 bg-primary-600 rounded-lg py-2 items-center"
                      onPress={() => handleAccept(inv)}
                      disabled={actionId !== null}
                    >
                      {actionId === inv.id + '-accept' ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text className="text-white font-semibold text-sm">Accept</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 bg-white border border-gray-300 rounded-lg py-2 items-center"
                      onPress={() => handleReject(inv)}
                      disabled={actionId !== null}
                    >
                      {actionId === inv.id + '-reject' ? (
                        <ActivityIndicator color="#6b7280" size="small" />
                      ) : (
                        <Text className="text-gray-700 font-semibold text-sm">Decline</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* My connections */}
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            My Connections
          </Text>
          {linkedUsers.length === 0 && !linksLoading ? (
            <View className="bg-white rounded-xl p-6 items-center mb-4 shadow-sm">
              <Text className="text-gray-500 text-sm text-center">
                No connections yet. Send a request below to link with your{' '}
                {role === 'landlord' ? 'tenant' : 'property manager'}.
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-xl overflow-hidden shadow-sm mb-4">
              {linkedUsers.map((link, i) => (
                <View
                  key={link.id}
                  className={`flex-row items-center justify-between px-4 py-3 ${i < linkedUsers.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <Text className="text-base text-gray-800 flex-1">
                    {link.other_display_name ?? 'Unknown'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRevoke(link.id, link.other_display_name)}
                    disabled={revokeMutation.isPending}
                  >
                    <Text className="text-danger-600 text-sm font-semibold">Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Send connection request */}
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Send Connection Request
          </Text>
          <View className="bg-white rounded-xl p-4 shadow-sm">
            <Text className="text-sm text-gray-600 mb-3">
              Enter the email address of your {role === 'landlord' ? 'tenant' : 'property manager'}.
              They must already have a Tenant Guardian account.
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-3"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
            />
            <TouchableOpacity
              className={`rounded-lg py-3 items-center ${inviting ? 'bg-primary-300' : 'bg-primary-600'}`}
              onPress={handleInvite}
              disabled={inviting}
            >
              {inviting ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-bold text-sm">Send Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      }
    />
  );
}
