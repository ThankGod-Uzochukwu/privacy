import React, {useMemo, useRef, useState} from 'react';
import {
  Animated,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  PanResponder,
  View,
} from 'react-native';
import {palette, tw} from '@/core/theme/tw';

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** Fired once when the user lets go – cheap place to persist. */
  onChangeEnd?: (value: number) => void;
  accessibilityLabel?: string;
  color?: string;
  disabled?: boolean;
};

const TRACK = 6;
const THUMB = 20;
const HEIGHT = 36;

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Rounds to the nearest `step` (anchored at `min`) and clamps – pure, so it's unit-tested. */
export function snapValue(raw: number, min: number, max: number, step: number) {
  const snapped = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
  // Trim float noise (0.30000000000000004) without losing real precision.
  return clamp(Number(snapped.toFixed(6)), min, max);
}

/**
 * A draggable slider built on PanResponder, so the exact same gesture code
 * runs on Windows, macOS and the web. Click anywhere on the track to jump,
 * then drag; the whole 36pt-tall strip is the hit target.
 */
export function DragSlider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  onChangeEnd,
  accessibilityLabel,
  color = palette.accent,
  disabled,
}: Props) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  // PanResponder is created once; everything it reads goes through refs.
  const live = useRef({value, width, min, max, step, onChange, onChangeEnd});
  live.current = {value, width, min, max, step, onChange, onChangeEnd};
  const start = useRef(value);
  const last = useRef(value);

  const responder = useMemo(() => {
    const emit = (raw: number) => {
      const c = live.current;
      const v = snapValue(raw, c.min, c.max, c.step);
      if (v !== last.current) {
        last.current = v;
        c.onChange(v);
      }
    };
    const grow = (to: number) =>
      Animated.spring(scale, {
        toValue: to,
        useNativeDriver: false,
        speed: 40,
        bounciness: 6,
      }).start();

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => {
        const c = live.current;
        setActive(true);
        grow(1.18);
        const x = e.nativeEvent.locationX;
        if (c.width > 0 && typeof x === 'number') {
          emit(c.min + clamp(x / c.width, 0, 1) * (c.max - c.min));
        }
        start.current = last.current;
      },
      onPanResponderMove: (_, g) => {
        const c = live.current;
        if (c.width > 0) {
          emit(start.current + (g.dx / c.width) * (c.max - c.min));
        }
      },
      onPanResponderRelease: () => {
        setActive(false);
        grow(1);
        live.current.onChangeEnd?.(last.current);
      },
      onPanResponderTerminate: () => {
        setActive(false);
        grow(1);
        live.current.onChangeEnd?.(last.current);
      },
    });
  }, [scale]);

  // Keep the gesture's notion of "current" in sync with controlled updates.
  last.current = active ? last.current : value;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const fraction = max === min ? 0 : clamp((value - min) / (max - min), 0, 1);
  const fillWidth = fraction * width;

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
    const next = snapValue(value + dir * Math.max(step, (max - min) / 20), min, max, step);
    onChange(next);
    onChangeEnd?.(next);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{min, max, now: value}}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={onAccessibilityAction}
      onLayout={onLayout}
      style={[tw.style('justify-center', disabled && 'opacity-40'), {height: HEIGHT}]}
      pointerEvents={disabled ? 'none' : 'auto'}
      {...responder.panHandlers}
    >
      {/* Children ignore pointer events so locationX is always relative to the strip. */}
      <View
        pointerEvents="none"
        style={[tw`overflow-hidden rounded-full bg-veil-line`, {height: TRACK}]}
      >
        <View
          style={[tw`rounded-full`, {height: TRACK, width: fillWidth, backgroundColor: color}]}
        />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          tw`absolute rounded-full border-2 bg-white`,
          {
            top: (HEIGHT - THUMB) / 2,
            width: THUMB,
            height: THUMB,
            left: fillWidth - THUMB / 2,
            borderColor: color,
            transform: [{scale}],
          },
          active && {backgroundColor: color},
        ]}
      />
    </View>
  );
}
