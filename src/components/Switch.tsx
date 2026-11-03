import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Pressable} from 'react-native';
import {palette, tw} from '@/core/theme/tw';

type Props = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const W = 42;
const H = 24;
const PAD = 3;
const THUMB = H - PAD * 2;

/** Animated toggle. Drawn from Views so it looks identical on every renderer. */
export function Switch({value, onValueChange, disabled, accessibilityLabel}: Props) {
  const t = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: value ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [t, value]);

  // The track colour and thumb position are animated values, so they stay inline; the rest is Tailwind.
  const bg = t.interpolate({inputRange: [0, 1], outputRange: [palette.line, palette.accent]});
  const x = t.interpolate({inputRange: [0, 1], outputRange: [PAD, W - THUMB - PAD]});

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{checked: value, disabled}}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      hitSlop={6}
      style={[tw.style(disabled ? 'opacity-40' : ''), {width: W, height: H}]}
    >
      <Animated.View
        style={[tw`justify-center rounded-full`, {width: W, height: H, backgroundColor: bg}]}
      >
        <Animated.View
          style={[
            tw`absolute left-0 rounded-full bg-white`,
            {width: THUMB, height: THUMB, transform: [{translateX: x}]},
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
