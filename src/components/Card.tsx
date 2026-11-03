import React from 'react';
import {View} from 'react-native';
import {tw} from '@/core/theme/tw';
import {Text} from './Text';

type CardProps = {
  title?: string;
  subtitle?: string;
  /** Right-aligned header content (badges, buttons). */
  accessory?: React.ReactNode;
  tint?: 'none' | 'accent' | 'success' | 'warn' | 'danger';
  className?: string;
  children?: React.ReactNode;
};

const tints = {
  none: 'border-veil-border',
  accent: 'border-veil-accent/45',
  success: 'border-veil-success/40',
  warn: 'border-veil-warn/40',
  danger: 'border-veil-danger/40',
} as const;

export function Card({title, subtitle, accessory, tint = 'none', className, children}: CardProps) {
  return (
    <View style={tw.style('gap-3 rounded-2xl border bg-veil-surface p-4', tints[tint], className)}>
      {title ? (
        <View style={tw`flex-row items-start gap-3`}>
          <View style={tw`min-w-0 flex-1`}>
            <Text variant="heading">{title}</Text>
            {subtitle ? (
              <Text variant="small" tone="muted" className="mt-0.5 leading-[17px]">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {accessory}
        </View>
      ) : null}
      {children}
    </View>
  );
}
