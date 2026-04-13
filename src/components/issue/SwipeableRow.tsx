import { useRef } from 'react';
import { Animated, PanResponder, View, TouchableOpacity, Text } from 'react-native';

const DELETE_BUTTON_WIDTH = 72;
const SWIPE_THRESHOLD = -50;

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
}

export function SwipeableRow({ children, onDelete }: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const close = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start(() => {
      isOpen.current = false;
    });
  };

  const open = () => {
    Animated.spring(translateX, {
      toValue: -DELETE_BUTTON_WIDTH,
      useNativeDriver: true,
      bounciness: 0,
    }).start(() => {
      isOpen.current = true;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      // If the row is open, capture any tap so we can close it
      onStartShouldSetPanResponder: () => isOpen.current,
      // Capture horizontal swipes (dx dominates dy and has moved at least 8px)
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        !isOpen.current && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
      onPanResponderMove: (_, { dx }) => {
        const clamped = Math.max(-DELETE_BUTTON_WIDTH, Math.min(0, dx));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        if (isOpen.current) {
          close();
        } else if (dx < SWIPE_THRESHOLD || vx < -0.5) {
          open();
        } else {
          close();
        }
      },
    }),
  ).current;

  return (
    <View style={{ overflow: 'hidden', borderRadius: 12, marginBottom: 12 }}>
      {/* Delete button sits behind the card — inset so it has rounded corners on both sides */}
      <View
        style={{
          position: 'absolute',
          right: 4,
          top: 4,
          bottom: 4,
          width: DELETE_BUTTON_WIDTH - 8,
          backgroundColor: '#ef4444',
          borderRadius: 10,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <TouchableOpacity
          onPress={() => {
            close();
            onDelete();
          }}
          style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: 'white', fontSize: 18, marginBottom: 2 }}>🗑</Text>
          <Text style={{ color: 'white', fontSize: 11, fontWeight: '600' }}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Foreground card — slides left to reveal the button */}
      <Animated.View
        style={{ transform: [{ translateX }], backgroundColor: 'white', borderRadius: 12 }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}
