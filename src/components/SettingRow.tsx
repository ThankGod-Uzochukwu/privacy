import React from 'react';
import {View} from 'react-native';
import {tw} from '@/core/theme/tw';
import {Switch} from './Switch';
import {Text} from './Text';

type Props = {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /** Shown under the description when the platform can't do this. */
  unavailable?: string;
  last?: boolean;
};

/** Label + helper text on the left, toggle on the right. */
export function SettingRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
  unavailable,
  last,
}: Props) {
  return (
    <View
      style={tw.style('flex-row items-center gap-4 py-3', !last && 'border-b border-veil-border')}
    >
      <View style={tw`min-w-0 flex-1`}>
        <Text variant="heading" className={disabled ? 'opacity-50' : ''}>
          {title}
        </Text>
        {description ? (
          <Text variant="small" tone="muted" className="mt-0.5 leading-[17px]">
            {description}
          </Text>
        ) : null}
        {unavailable ? (
          <Text variant="small" tone="warn" className="mt-0.5 leading-[17px]">
            {unavailable}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
      />
    </View>
  );
}
