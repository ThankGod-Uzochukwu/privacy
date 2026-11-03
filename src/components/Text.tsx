import React from 'react';
import {Text as RNText, type TextProps} from 'react-native';
import {tw} from '@/core/theme/tw';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'small' | 'overline' | 'mono';
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'success' | 'warn' | 'danger';

const variants: Record<Variant, string> = {
  display: 'font-sans text-display font-bold tracking-tight',
  title: 'font-sans text-title font-bold tracking-tight',
  heading: 'font-sans text-heading font-semibold',
  body: 'font-sans text-body',
  small: 'font-sans text-small',
  overline: 'font-sans text-overline font-bold uppercase tracking-widest',
  mono: 'font-mono text-small',
};

const tones: Record<Tone, string> = {
  default: 'text-veil-text',
  muted: 'text-veil-muted',
  faint: 'text-veil-faint',
  accent: 'text-veil-accent',
  success: 'text-veil-success',
  warn: 'text-veil-warn',
  danger: 'text-veil-danger',
};

export type AppTextProps = TextProps & {variant?: Variant; tone?: Tone; className?: string};

/** Typography from the design system; pass `className` for any Tailwind override. */
export function Text({
  variant = 'body',
  tone = 'default',
  className,
  style,
  ...rest
}: AppTextProps) {
  return <RNText {...rest} style={[tw.style(variants[variant], tones[tone], className), style]} />;
}
