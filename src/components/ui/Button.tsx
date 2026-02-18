import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

const VARIANT_CLASSES = {
  primary: { wrapper: 'bg-primary-600', text: 'text-white' },
  secondary: { wrapper: 'bg-white border border-gray-300', text: 'text-gray-700' },
  danger: { wrapper: 'bg-danger-600', text: 'text-white' },
};

export function Button({ onPress, label, variant = 'primary', loading, disabled }: ButtonProps) {
  const v = VARIANT_CLASSES[variant];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      className={`rounded-xl py-4 items-center ${v.wrapper} ${isDisabled ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#374151' : 'white'} />
      ) : (
        <Text className={`font-bold text-base ${v.text}`}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
