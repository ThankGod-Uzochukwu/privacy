import React from 'react';
import {View} from 'react-native';
import {tw} from '@/core/theme/tw';
import {DragSlider} from './DragSlider';
import {Text} from './Text';

type Props = {
  label: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
  color?: string;
};

const CELLS = 24;

/** Labelled percentage slider with a live checkerboard preview. */
export function OpacityControl({label, value, min = 0, onChange, disabled, hint, color}: Props) {
  return (
    <View style={tw`gap-2`}>
      <View style={tw`flex-row items-center justify-between`}>
        <Text variant="heading">{label}</Text>
        <Text variant="mono" tone="accent" className="text-sm font-bold">
          {Math.round(value * 100)}%
        </Text>
      </View>
      <View style={tw`h-11 overflow-hidden rounded-xl border border-veil-border`}>
        <View style={tw`flex-1 flex-row flex-wrap`}>
          {Array.from({length: CELLS}).map((_, i) => (
            <View
              key={i}
              style={[
                tw.style(
                  'h-1/2',
                  (i + Math.floor(i / 12)) % 2 === 0 ? 'bg-[#1A2030]' : 'bg-[#10141E]',
                ),
                {width: `${100 / 12}%`},
              ]}
            />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={[tw`absolute inset-0 bg-veil-accent`, {opacity: value}]}
        />
      </View>
      <DragSlider
        value={value}
        min={min}
        max={1}
        step={0.01}
        onChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        color={color}
      />
      <View style={tw`-mt-1 flex-row justify-between`}>
        <Text variant="small" tone="faint">
          {Math.round(min * 100)}%
        </Text>
        <Text variant="small" tone="faint">
          100%
        </Text>
      </View>
      {hint ? (
        <Text variant="small" tone="muted" className="leading-[17px]">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
